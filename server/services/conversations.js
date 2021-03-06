//
//   Copyright 2014 Ilkka Oksanen <iao@iki.fi>
//
//   Licensed under the Apache License, Version 2.0 (the "License");
//   you may not use this file except in compliance with the License.
//   You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
//   Unless required by applicable law or agreed to in writing,
//   software distributed under the License is distributed on an "AS
//   IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
//   express or implied.  See the License for the specific language
//   governing permissions and limitations under the License.
//

import UserGId from '../lib/userGId';

const assert = require('assert');
const log = require('../lib/log');
const search = require('../lib/search');
const notification = require('../lib/notification');
const User = require('../models/user');
const Window = require('../models/window');
const Conversation = require('../models/conversation');
const ConversationMember = require('../models/conversationMember');
const ConversationMessage = require('../models/conversationMessage');
const windowsService = require('./windows');

const MSG_BUFFER_SIZE = 200; // TODO: This should come from session:max_backlog setting

exports.findOrCreate1on1 = async function findOrCreate1on1(user, peerUserGId, network) {
  assert(user && peerUserGId && network);

  let conversation = null;
  const userMembers = await ConversationMember.find({ userGId: user.gIdString });
  const peerMembers = await ConversationMember.find({ userGId: peerUserGId.toString() });

  // Figure out 1on1 conversations where both users are members
  const commonMembers = userMembers.filter(member =>
    peerMembers.find(peer => peer.get('conversationId') === member.get('conversationId'))
  );

  for (const commonMember of commonMembers) {
    const candidate = await Conversation.fetch(commonMember.get('conversationId'));

    if (candidate.get('type') === '1on1' && candidate.get('network') === network) {
      conversation = candidate;
      break;
    }
  }

  if (!conversation) {
    conversation = await Conversation.create({
      owner: user.id,
      type: '1on1',
      name: null,
      network
    });

    await ConversationMember.create({
      conversationId: conversation.id,
      userGId: user.gIdString,
      role: 'u'
    });

    await ConversationMember.create({
      conversationId: conversation.id,
      userGId: peerUserGId.toString(),
      role: 'u'
    });
  }

  return conversation;
};

exports.delete = async function deleteCoversation(conversation) {
  const members = await ConversationMember.find({ conversationId: conversation.id });

  for (const member of members) {
    await member.delete();
  }

  const msgs = await ConversationMessage.find({ conversationId: conversation.id });

  for (const msg of msgs) {
    await msg.delete();
  }

  await conversation.delete();
};

exports.getAll = async function getAll(user) {
  const conversations = [];
  const members = await ConversationMember.find({ userGId: user.gIdString });

  for (const member of members) {
    const conversation = await Conversation.fetch(member.get('conversationId'));
    conversations.push(conversation);
  }

  return conversations;
};

exports.getPeerMember = async function getPeerMember(conversation, userGId) {
  const members = await ConversationMember.find({ conversationId: conversation.id });

  return members.find(member => !member.gId.equals(userGId));
};

exports.getMemberRole = async function getMemberRole(conversation, userGId) {
  const targetMember = await ConversationMember.findFirst({
    conversationId: conversation.id,
    userGId: userGId.toString()
  });

  return targetMember ? targetMember.get('role') : null;
};

exports.updateMemberRole = async function updateMemberRole(conversation, userGId, role) {
  const targetMember = await ConversationMember.findFirst({
    conversationId: conversation.id,
    userGId: userGId.toString()
  });

  if (targetMember) {
    await targetMember.set({ role });
    await broadcastAddMembers(conversation, userGId, role);
  }
};

exports.setGroupMembers = async function setGroupMembers(conversation, newMembersHash) {
  const oldMembers = await ConversationMember.find({ conversationId: conversation.id });

  for (const oldMember of oldMembers) {
    if (!Object.keys(newMembersHash).some(newMember => newMember === oldMember.gIdString)) {
      await deleteConversationMember(conversation, oldMember, { skipCleanUp: true });
    }
  }

  for (const newMember of Object.keys(newMembersHash)) {
    if (!oldMembers.some(oldMember => oldMember.gIdString === newMember)) {
      await ConversationMember.create({
        conversationId: conversation.id,
        userGId: newMember,
        role: newMembersHash[newMember]
      });
    }
  }

  await broadcastFullAddMembers(conversation);
};

exports.addGroupMember = async function addGroupMember(conversation, userGId, role, options = {}) {
  assert(role === 'u' || role === '+' || role === '@' || role === '*', `Unknown role ${role}, userGId: ${userGId}`);

  const targetMember = await ConversationMember.findFirst({
    conversationId: conversation.id,
    userGId: userGId.toString()
  });

  if (!targetMember) {
    await ConversationMember.create({
      conversationId: conversation.id,
      userGId: userGId.toString(),
      role
    });

    if (!options.silent) {
      await broadcastAddMessage(conversation, {
        userGId: userGId.toString(),
        cat: 'join'
      });
    }

    await broadcastAddMembers(conversation, userGId, role, options);
  } else {
    await targetMember.set({ role });
  }
};

exports.removeGroupMember = async function removeGroupMember(conversation, userGId, options = {}) {
  const targetMember = await ConversationMember.findFirst({
    conversationId: conversation.id,
    userGId: userGId.toString()
  });

  if (targetMember) {
    await deleteConversationMember(conversation, targetMember, options);
  }
};

exports.addMessage = async function addMessage(conversation, { userGId = null, cat, body = '' }, excludeSession) {
  return broadcastAddMessage(conversation, { userGId, cat, body }, excludeSession);
};

exports.editMessage = async function editMessage(conversation, user, conversationMessageId, text) {
  const message = await ConversationMessage.fetch(conversationMessageId);

  if (!message) {
    return false;
  }

  const userGId = UserGId.create(message.get('userGId'));

  if (!userGId.equals(user.gId)) {
    return false;
  }

  await message.set('body', text);
  await message.set('updatedTs', new Date());
  await message.set('status', text === '' ? 'deleted' : 'edited');
  await message.set('updatedId', await ConversationMessage.currentId());

  const ntf = message.convertToNtf();
  ntf.type = 'ADD_MESSAGE';

  await broadcast(conversation, ntf);

  return true;
};

exports.sendFullAddMembers = async function sendFullAddMembers(conversation, user) {
  return sendCompleteAddMembers(conversation, user);
};

exports.setTopic = async function setTopic(conversation, topic, nickName) {
  const changes = await conversation.set({ topic });

  if (changes === 0) {
    return;
  }

  await broadcast(conversation, { type: 'UPDATE_WINDOW', topic });

  await broadcastAddMessage(conversation, {
    cat: 'info',
    body: `${nickName} has changed the topic to: "${topic}".`
  });
};

exports.setPassword = async function setPassword(conversation, password) {
  const changes = await conversation.set({ password });

  if (changes === 0) {
    return;
  }

  await broadcast(conversation, {
    type: 'UPDATE_WINDOW',
    password
  });

  const text =
    password === ''
      ? 'Password protection has been removed from this channel.'
      : `The password for this channel has been changed to ${password}.`;

  await broadcastAddMessage(conversation, {
    cat: 'info',
    body: text
  });
};

async function broadcastAddMessage(conversation, { userGId = null, cat, body = '' }, excludeSession) {
  const message = await ConversationMessage.create({
    userGId,
    cat,
    body,
    conversationId: conversation.id
  });

  const ids = await ConversationMessage.findIds({ conversationId: conversation.id });

  while (ids.length - MSG_BUFFER_SIZE > 0) {
    const expiredMessage = await ConversationMessage.fetch(ids.shift());

    if (expiredMessage) {
      await expiredMessage.delete();
    }
  }

  const ntf = message.convertToNtf();
  ntf.type = 'ADD_MESSAGE';

  await windowsService.scanMentions(conversation, message);

  await broadcast(conversation, ntf, excludeSession);
  search.storeMessage(conversation.id, ntf);

  return ntf;
}

async function broadcastAddMembers(conversation, userGId, role, options) {
  await broadcast(
    conversation,
    {
      type: 'UPDATE_MEMBERS',
      reset: false,
      members: [
        {
          userId: userGId.toString(),
          role
        }
      ]
    },
    null,
    options
  );
}

async function broadcastFullAddMembers(conversation) {
  const ntf = await createFullAddMemberNtf(conversation);
  await broadcast(conversation, ntf);
}

async function sendCompleteAddMembers(conversation, user) {
  const ntf = await createFullAddMemberNtf(conversation);
  const window = await windowsService.findOrCreate(user, conversation);

  ntf.windowId = window.id;

  await notification.broadcast(user, ntf);
}

async function broadcast(conversation, ntf, excludeSession, options = {}) {
  const members = await ConversationMember.find({ conversationId: conversation.id });

  for (const member of members) {
    const userGId = UserGId.create(member.get('userGId'));

    if (!userGId.isMASUser) {
      continue;
    }

    const user = await User.fetch(userGId.id);
    let window;

    if (options.silent) {
      // Don't create 1on1 window if it doesn't exist. This is to prevent nick
      // changes from opening old 1on1s
      window = await Window.findFirst({ userId: user.id, conversationId: conversation.id });
    } else {
      window = await windowsService.findOrCreate(user, conversation);
    }

    if (window) {
      ntf.windowId = window.id;
      await notification.broadcast(user, ntf, excludeSession);
    }
  }
}

async function createFullAddMemberNtf(conversation) {
  const members = await ConversationMember.find({ conversationId: conversation.id });

  const membersList = members.map(member => ({
    userId: member.get('userGId'),
    role: member.get('role')
  }));

  return {
    type: 'UPDATE_MEMBERS',
    reset: true,
    members: membersList
  };
}

async function deleteConversationMember(conversation, member, options) {
  log.info(`User: ${member.get('userGId')} removed from conversation: ${conversation.id}`);

  if (!options.silent && conversation.get('type') === 'group') {
    await broadcastAddMessage(conversation, {
      userGId: member.get('userGId'),
      cat: options.wasKicked ? 'kick' : 'part',
      body: options.wasKicked && options.reason ? options.reason : ''
    });
  }

  if (!options.skipCleanUp) {
    await broadcast(
      conversation,
      {
        type: 'DELETE_MEMBERS',
        members: [
          {
            userId: member.get('userGId')
          }
        ]
      },
      null,
      options
    );
  }

  const userGId = UserGId.create(member.get('userGId'));

  if (!options.silent && userGId.isMASUser) {
    // Never let window to exist alone without linked conversation
    const user = await User.fetch(userGId.id);
    await windowsService.remove(user, conversation);
  }

  await member.delete();
}
