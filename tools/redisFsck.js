#!/usr/bin/env node
//
//   Copyright 2015 Ilkka Oksanen <iao@iki.fi>
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

'use strict';

const readlineSync = require('readline-sync'),
      assert = require('assert'),
      co = require('co'),
      redisModule = require('../server/lib/redis'),
      redis = redisModule.createClient();

const tests = [
    outboxTest,
    desktopTest,
    activeDesktopTest,
    conversationIndexTest,
    conversationIndexAccessTest,
    conversationMembersTest,
    orphanGroupConversationTest,
    conversationListTest,
    oneOnOneHistoryTest,
    windowIndexTest,
    windowTest,
    windowlistTest,
    ircChannelSubscriptionsTest,
    friendsExistTest,
    conversationIndexCaseTest
];

console.log(' ************************************************************************');
console.log(' *** This is a experimental MAS Redis database consistency checking tool');
console.log(' ************************************************************************');

let response = readlineSync.question('Are you sure you want to continue? [yes/no]: ');

if (response !== 'yes') {
    process.exit(1);
}

co(function*() {
    yield redisModule.loadScripts();

    for (let test of tests) {
        yield test();
    }

    yield redis.quit();
    console.log('DONE');
})();

function *outboxTest() {
    let outboxKeys = yield redis.keys('outbox:*');

    for (let key of outboxKeys) {
        let keyParts = key.split(':');
        let userId = keyParts[1];
        let sessionId = keyParts[2];

        let score = yield redis.zscore('sessionlastheartbeat', `${userId}:${sessionId}`);

        if (!score) {
            console.log('Removing stale session');
            yield redis.run('deleteSession', userId, sessionId);
        }
    }
}

function *conversationIndexTest() {
    let conversationKeys = (yield redis.keys('conversation:*'));
    let conversationIndexFieldsLength = yield redis.hlen('index:conversation');

    let passed = conversationKeys.length === conversationIndexFieldsLength;

    console.log(`Conversations: ${conversationKeys.length}`);
    console.log(`Conversation index entries: ${conversationIndexFieldsLength}`);

    printVerdict('index:conversation', passed);

    if (!passed) {
        console.log('Rebuilding index:conversation...');
        yield redis.del('index:conversation');

        for (let conversationKey of conversationKeys) {
            let conversation = yield redis.hgetall(conversationKey);
            let conversationId = conversationKey.split(':')[1];
            let key;

            let members = yield redis.hgetall(`conversationmembers:${conversationId}`);

            conversation.name = conversation.name.toLowerCase();

            if (conversation.type === 'group') {
                key = `group:${conversation.network}:${conversation.name}`;
            } else {
                let users = Object.keys(members).sort();
                key = `1on1:${conversation.network}:${users[0]}:${users[1]}`;
            }

            yield redis.hset('index:conversation', key, conversationId);
        }
    }
}

function *conversationIndexAccessTest() {
    let index = yield redis.hgetall('index:conversation');
    let indexKeys = Object.keys(index);

    for (let key of indexKeys) {
        let keyParts = key.split(':');
        let type = keyParts[0];
        let network = keyParts[1];

        assert(type === 'group' || type === '1on1');
        assert(network === 'IRCNet' || network === 'MAS' ||  network === 'FreeNode' ||
            network === 'W3C' || network === 'Flowdock');

        if (type === '1on1') {
            let user1 = keyParts[2];
            let user2 = keyParts[3];

            assert(user1.charAt(0) === 'm' || user2.charAt(0) === 'm');
        }

        let conversation = yield redis.hgetall(`conversation:${index[key]}`);

        if (!conversation) {
            console.log(`Removing index entry without conversation: ${key} -> ${index[key]}`);
            yield redis.hdel('index:conversation', key);
        }
    }

    printVerdict('conversation:index', true);
}

function *conversationMembersTest() {
    let conversationKeys = yield redis.keys('conversation:*');
    let conversationMembersKeys = yield redis.keys('conversationmembers:*');

    assert(conversationKeys.length === conversationMembersKeys.length);

    for (let conversationKey of conversationKeys) {
        let conversationId = conversationKey.split(':')[1];
        let conversation = yield redis.hgetall(conversationKey);
        let members = yield redis.hgetall(`conversationmembers:${conversationId}`);

        assert(members);

        for (let userId of Object.keys(members)) {
            if (userId.charAt(0) === 'm') {
                assert((yield redis.exists(`user:${userId}`)));
            }
        }

        if (conversation.type === '1on1' && Object.keys(members).length !== 2) {
            console.log('Removing invalid 1on1, conversationId: ' + conversationId + '...');
            yield removeConversation(conversationId);
        }
    }

    printVerdict('conversationmembers', true);
}

function *conversationListTest() {
    let conversationListKeys = yield redis.keys('conversationlist:*');

    for (let conversationListKey of conversationListKeys) {
        let list = yield redis.smembers(conversationListKey);

        for (let conversationId of list) {
            let conversation = yield redis.hgetall(`conversation:${conversationId}`);

            assert(conversation);
        }
    }

    printVerdict('conversationlists', true);
}

function *oneOnOneHistoryTest() {
    let conversationHistoryKeys = yield redis.keys('1on1conversationhistory:*');

    for (let conversationHistoryKey of conversationHistoryKeys) {
        let list = yield redis.smembers(conversationHistoryKey);

        for (let conversationId of list) {
            let conversation = yield redis.hgetall(`conversation:${conversationId}`);

            if (!conversation) {
                console.log('Removing invalid 1on1conversationhistory entry...');
                yield redis.srem(conversationHistoryKey, conversationId);
            }
        }
    }

    printVerdict('1on1conversationhistory', true);
}

function *windowIndexTest() {
    let windowKeys = yield redis.keys('window:*');
    let windowIndexEntries = yield redis.hgetall('index:windowIds');

    let passed = windowKeys.length === Object.keys(windowIndexEntries).length;

    for (let entry of Object.keys(windowIndexEntries)) {
        let windowId = windowIndexEntries[entry];
        let userId = entry.split(':')[0];
        let conversationId = entry.split(':')[1];

        assert((yield redis.exists(`user:${userId}`)));

        let conversationExists = yield redis.exists(`conversation:${conversationId}`);

        if (!conversationExists) {
            console.log(`Removing orphan windowId: ${windowId}, userId: ${userId}`);

            yield redis.del(`window:${userId}:${windowId}`);
            yield redis.hdel('index:windowIds', `${userId}:${conversationId}`);
            yield redis.srem(`windowlist:${userId}`, windowId);
        }

        let windowExists = yield redis.exists(`window:${userId}:${windowId}`);

        if (!windowExists) {
            console.log(`Invalid windowlist entry, userId: ${userId}`);
        }

    }

    printVerdict('index:windowIds', passed);
}

function *orphanGroupConversationTest() {
    let windowKeys = yield redis.keys('window:*');
    let conversationKeys = yield redis.keys('conversation:*');

    let activeConversations = {};

    for (let entry of windowKeys) {
        let conversationId = yield redis.hget(entry, 'conversationId');
        activeConversations[conversationId] = true;
    }

    for (let entry of conversationKeys) {
        let conversation = yield redis.hgetall(entry);
        let conversationId = entry.split(':')[1];

        if (conversation.type === 'group' && !activeConversations[conversationId]) {
            console.log('Orphan group conversation found: ' + entry);
        }
    }

    printVerdict('orphan group conversations', true);
}

function *windowTest() {
    let windowKeys = yield redis.keys('window:*');

    for (let windowKey of windowKeys) {
        let windowItem = yield redis.hgetall(windowKey);

        let userId = windowKey.split(':')[1];
        assert((yield redis.exists(`user:${userId}`)));

        assert((yield redis.exists(`conversation:${windowItem.conversationId}`)));
    }

    printVerdict('windows', true);
}

function *windowlistTest() {
    let windowListKeys = yield redis.keys('windowlist:*');

    for (let windowListKey of windowListKeys) {
        let userId = windowListKey.split(':')[1];
        assert((yield redis.exists(`user:${userId}`)));

        let windowIds = yield redis.smembers(windowListKey);

        for (let windowId of windowIds) {
            assert((yield redis.exists(`window:${userId}:${windowId}`)));
        }
    }

    printVerdict('windowlist', true);
}

function *friendsExistTest() {
    let friendsKeys = yield redis.keys('friends:*');

    for (let friendsKey of friendsKeys) {
        let friends = yield redis.smembers(friendsKey);

        for (let userId of friends) {
            let exists = yield redis.exists(`user:${userId}`);

            if (!exists) {
                console.log(`${friendsKeys} has non-existing friend ${userId}`);
            }
        }
    }

    printVerdict('friends', true);
}

function *desktopTest() {
    let windowKeys = yield redis.keys('window:*');

    for (let windowKey of windowKeys) {
        let masWindow = yield redis.hgetall(windowKey);

        if (masWindow.desktop !== null && isNaN(masWindow.desktop)) {
            console.log(`Fixing invalid window.desktop for ${windowKey}`);
            yield redis.hset(windowKey, 'desktop', 0);
        }
    }

    printVerdict('window.desktop', true);
}

function *activeDesktopTest() {
    let settingsKeys = yield redis.keys('settings:*');

    for (let settingsKey of settingsKeys) {
        let activeDesktop = yield redis.hget(settingsKey, 'activeDesktop');

        if (activeDesktop !== null) {
            let userId = settingsKey.split(':')[1];
            let windowKeys = yield redis.keys(`window:${userId}:*`);
            let found = false;
            let lastValidDestopId;

            for (let windowKey of windowKeys) {
                let desktop = yield redis.hget(windowKey, 'desktop');
                lastValidDestopId = desktop;

                if (desktop === activeDesktop) {
                    found = true;
                    break;
                }
            }

            if (!found && windowKeys.length > 0) {
                console.log(`ERROR: Fixing invalid activeDesktop value: '${activeDesktop}'.`);
                yield redis.hset(settingsKey, 'activeDesktop', lastValidDestopId);
            }
        }
    }

    printVerdict('settings.activeDesktop', true);
}

function *conversationIndexCaseTest() {
    let index = yield redis.hgetall('index:conversation');

    assert(index);

    let keyArray = Object.keys(index);

    for (let entry of keyArray) {
        if (!(/^group:/.test(entry))) {
            continue;
        }

        let parts = /^group:([a-zA-Z0-9]+):(.+)$/.exec(entry);

        assert(parts.length === 3);

        let channel = parts[2];
        let channelLowerCase = parts[2].toLowerCase();

        if (channel !== channelLowerCase) {
            let value = yield redis.hget('index:conversation', `group:${parts[1]}:${channel}`);
            assert(value);

            let existingValue =  yield redis.hget(
                'index:conversation', `group:${parts[1]}:${channelLowerCase}`);

            if (existingValue && value !== existingValue) {
                console.log('BAD CONVERSATION, can\'t fix:' + parts[1] + ':' + channel);
                process.exit(1);
            }

            yield redis.hdel('index:conversation', `group:${parts[1]}:${channel}`);
            yield redis.hset('index:conversation', `group:${parts[1]}:${channelLowerCase}`, value);

            console.log(
                `Fixing group:${parts[1]}:${channel} to group:${parts[1]}:${channelLowerCase}`);
        }
    }

    console.log(keyArray.length);
}

function *ircChannelSubscriptionsTest() {
    let keys = yield redis.keys('ircchannelsubscriptions:*');

    for (let key of keys) {
        let channels = yield redis.hgetall(key);
        let network = key.split(':')[2];

        for(let channel of Object.keys(channels)) {
            let indexKey = `group:${network}:${channel}`;
            let conversationId = yield redis.hget('index:conversation', indexKey);

            if (!conversationId) {
                let loweCaseIndexKey = `group:${network}:${channel.toLowerCase()}`;
                let lowerCaseconversationId = yield redis.hget(
                    'index:conversation', loweCaseIndexKey);

                if (!lowerCaseconversationId) {
                    console.log(`Removing ircchannelsubscriptions ${indexKey}`);
                    yield redis.hdel(key, channel);
                } else {
                    console.log(`Renaming ircchannelsubscriptions ${indexKey} to lower case`);
                    yield redis.hdel(key, channel);
                    yield redis.hset(key, channel.toLowerCase(), channels[channel]);
                }
            }
        }
    }

    printVerdict('ircchannelsubscriptions', true);
}

function printVerdict(desc, passed) {
    console.log('Checking ' + desc + ': ' + (passed ? '[PASS]' : '[FAIL]'));
}

function *removeConversation(conversationId) {
    let conversation = yield redis.hgetall(`conversation:${conversationId}`);
    let members = yield redis.hgetall(`conversationmembers:${conversationId}`);

    yield redis.del(`conversation:${conversationId}`);
    yield redis.del(`conversationmsgs:${conversationId}`);
    yield redis.del(`conversationmembers:${conversationId}`);

    for (let userId of Object.keys(members)) {
        yield redis.srem(`conversationlist:${userId}`, conversationId);
    }

    let key;

    if (conversation.type === 'group') {
        key = 'group:' + conversation.network + ':' + conversation.name;
    } else {
        let userIds = Object.keys(members);
        userIds = userIds.sort();
        key = '1on1:' + conversation.network + ':' + userIds[0] + ':' + userIds[1];
    }

    yield redis.hdel('index:conversation', key);
}
