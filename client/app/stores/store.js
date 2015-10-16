//
//   Copyright 2009-2014 Ilkka Oksanen <iao@iki.fi>
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

/* globals moment, $ */

import Ember from 'ember';
import Users from '../utils/users';
import Window from '../models/window';
import Alert from '../models/alert';
import IndexArray from '../utils/index-array';
import BaseStore from '../stores/base-store';
import socket from '../utils/socket';
import { calcMsgHistorySize } from '../utils/msg-history-sizer';
import { dispatch } from '../utils/dispatcher';

export default BaseStore.extend({
    name: 'windows',

    users: null,
    windows: null,
    alerts: null,
    networks: null,
    modals: null,

    settings: null,
    profile: null,

    userId: null,
    initDone: false,
    maxBacklogMsgs: 100000,
    msgBuffer: null, // Only used during startup
    cachedUpto: 0,
    dayCounter: 0,

    init() {
        this._super();

        this.set('users', Users.create());
        this.set('networks', Ember.A([]));
        this.set('modals', Ember.A([]));

        this.set('windows', IndexArray.create({ index: 'windowId', factory: Window }));
        this.set('alerts', IndexArray.create({ index: 'alertId', factory: Alert }));

        this.set('settings', Ember.Object.create({
            theme: 'default',
            activeDesktop: null,
            email: '', // TBD: Remove from here, keep in profile
            emailConfirmed: true
        }));

        this.set('profile', Ember.Object.create({
            nick: '',
            name: '',
            email: ''
        }));

        let authCookie = $.cookie('auth') || '';
        let [ userId, secret ] = authCookie.split('-');

        if (!userId || !secret) {
            dispatch('LOGOUT');
        }

        this.set('userId', userId);
        this.set('secret', secret);

        this.msgBuffer = [];

        this._startDayChangedService();
    },

    desktops: Ember.computed('windows.@each.desktop', 'windows.@each.newMessagesCount', function() {
        let desktops = {};
        let desktopsArray = Ember.A([]);

        this.get('windows').forEach(function(masWindow) {
            let newMessages = masWindow.get('newMessagesCount');
            let desktop = masWindow.get('desktop');
            let initials = masWindow.get('simplifiedName').substr(0, 2).toUpperCase();

            if (desktops[desktop]) {
                desktops[desktop].messages += newMessages;
            } else {
                desktops[desktop] = { messages: newMessages, initials: initials };
            }
        });

        Object.keys(desktops).forEach(function(desktop) {
            desktopsArray.push({
                id: parseInt(desktop),
                initials: desktops[desktop].initials,
                messages: desktops[desktop].messages
            });
        });

        return desktopsArray;
    }),

    deletedDesktopCheck: Ember.observer('desktops.[]', 'initDone', function() {
        if (!this.get('initDone')) {
            return;
        }

        let desktopIds = this.get('desktops').map(d => d.id);

        if (desktopIds.indexOf(this.get('settings.activeDesktop')) === -1) {
            dispatch('CHANGE_ACTIVE_DESKTOP', {
                desktop: this.get('desktops').map(d => d.id).sort()[0] // Oldest
            });
        }
    }),

    toJSON() {
        let data = {
            windows: [],
            users: {},
            activeDesktop: this.get('activeDesktop'),
            userId: this.get('userId'),
            version: 1
        };

        let maxBacklogMsgs = calcMsgHistorySize();
        let cachedUpto = 0;

        this.get('windows').forEach(function(masWindow) {
            let messages = [];

            let sortedMessages = masWindow.get('messages').sortBy('ts').slice(-1 * maxBacklogMsgs);

            sortedMessages.forEach(function(message) {
                let messageData = message.getProperties([
                    'gid',
                    'body',
                    'cat',
                    'ts',
                    'updatedTs',
                    'userId',
                    'status',
                    'type',
                    'hideImages'
                ]);

                if (messageData.gid > cachedUpto) {
                    cachedUpto = messageData.gid;
                }

                if (!messageData.status || messageData.status === 'original') {
                    // Save space
                    delete messageData.status;
                    delete messageData.updatedTs;
                }

                messages.push(messageData);
                data.users[messageData.userId] = true;
            });

            let windowProperties = masWindow.getProperties([
                'windowId',
                'generation',
                'name',
                'userId',
                'network',
                'type',
                'row',
                'column',
                'desktop',
                'newMessagesCount',
                'minimizedNamesList',
                'alerts'
            ]);

            windowProperties.messages = messages;
            data.windows.push(windowProperties);
        });

        data.cachedUpto = cachedUpto;
        this.set('cachedUpto', cachedUpto);

        for (let userId of Object.keys(data.users)) {
            data.users[userId] = this.get('users.users.' + userId);
        }

        return data;
    },

    fromJSON(data) {
        for (let userId of Object.keys(data.users)) {
            this.set('users.users.' + userId, data.users[userId]);
        }

        this.get('users').incrementProperty('isDirty');

        for (let windowData of data.windows) {
            let messages = windowData.messages;
            delete windowData.messages;

            let windowModel = this.get('windows').upsertModel(windowData);
            windowModel.get('messages').upsertModels(messages, { window: windowModel });
        }

        this.set('activeDesktop', data.activeDesktop);
        this.set('cachedUpto', data.cachedUpto ? data.cachedUpto : 0);
    },

    _startDayChangedService() {
        // Day has changed service
        let timeToTomorrow = moment().endOf('day').diff(moment()) + 1;

        let changeDay = function() {
            this.incrementProperty('dayCounter');
            Ember.run.later(this, changeDay, 1000 * 60 * 60 * 24);
        };

        Ember.run.later(this, changeDay, timeToTomorrow);
    },

    handleStart() {
        socket.start(this);
    },

    handleCloseAlert(data) {
        let callback = this.get('alerts').get('firstObject').get('resultCallback');

        if (callback) {
            callback(data.result);
        }

        this.get('alerts').shiftObject();
    },

    handleUpdateWindowAlerts(data) {
        data.window.set('alerts', data.alerts);

        socket.send({
            id: 'UPDATE',
            windowId: data.window.get('windowId'),
            alerts: data.alerts
        });
    },

    handleUploadFiles(data) {
        if (data.files.length === 0) {
            return;
        }

        let formData = new FormData();
        let files = Array.from(data.files);

        for (let file of files) {
            formData.append('file', file, file.name || 'webcam-upload.jpg');
        }

        formData.append('sessionId', socket.get('sessionId'));

        $.ajax({
            url: '/api/v1/upload',
            type: 'POST',
            data: formData,
            dataType: 'json',
            processData: false,
            contentType: false,
            success: resp => dispatch('SEND_TEXT', {
                text: resp.url.join(' '),
                window: data.window
            }),
            error: () => dispatch('ADD_ERROR', {
                body: 'File upload failed.',
                window: data.window
            })
        });
    },

    handleAddMessage(data) {
        data.window.messages.upsertModel({
            body: data.body,
            cat: 'msg',
            userId: this.get('userId'),
            ts: data.ts,
            gid: data.gid,
            window: data.window,
        });
    },

    handleAddMessageServer(data) {
        data.window = this._getWindow(data.windowId);
        delete window.windowId;

        if (!this.get('initDone')) {
            // Optimization: Avoid re-renders after every message
            this.msgBuffer.push(data);
        } else {
            data.window.messages.upsertModel(data);
        }
    },

    handleAddError(data) {
        data.window.messages.upsertModel({
            body: data.body,
            cat: 'error',
            userId: null,
            ts: moment().unix(),
            gid: 'error', // TODO: Not optimal, there's never second error message
            window: data.window,
        });
    },

    handleSendText(data) {
        socket.send({
            id: 'SEND',
            text: data.text,
            windowId: data.window.get('windowId')
        }, resp => {
            if (resp.status !== 'OK') {
                dispatch('OPEN_MODAL', {
                    name: 'info-modal',
                    model: {
                        title: 'Error',
                        body: resp.errorMsg
                    }
                });
            } else {
                dispatch('ADD_MESSAGE', {
                    body: data.text,
                    ts: resp.ts,
                    gid: resp.gid,
                    window: data.window
                });
            }
        });
    },

    handleSendCommand(data) {
        socket.send({
            id: 'COMMAND',
            command: data.command,
            params: data.params,
            windowId: data.window.get('windowId')
        }, resp => {
            if (resp.status !== 'OK') {
                dispatch('OPEN_MODAL', {
                    name: 'info-modal',
                    model: {
                        title: 'Error',
                        body: resp.errorMsg
                    }
                });
            }
        });
        return;
    },

    handleOpenModal(data) {
        this.get('modals').pushObject({
            name: data.name,
            model: data.model
        });
    },

    handleCloseModal() {
        this.get('modals').shiftObject();
    },

    handleOpenPriorityModal(data) {
        this.get('modals').unshiftObject({ // Show immediately
            name: data.name,
            model: data.model
        });
    },

    handleClosePriorityModal() {
        this.get('modals').shiftObject();
    },

    handleDestroyAccount() {
        socket.send({
            id: 'DESTROY_ACCOUNT'
        }, () => {
            $.removeCookie('auth', { path: '/' });
            window.location = '/';
        });
    },

    handleCreateGroup(data, acceptCb, rejectCb) {
        socket.send({
            id: 'CREATE',
            name: data.name,
            password: data.password
        }, resp => {
            if (resp.status === 'OK') {
                acceptCb();
            } else {
                rejectCb(resp.errorMsg);
            }
        });
    },

    handleJoinGroup(data, acceptCb, rejectCb) {
        socket.send({
            id: 'JOIN',
            name: data.name,
            network: 'MAS',
            password: data.password
        }, resp => {
            if (resp.status === 'OK') {
                acceptCb();
            } else {
                rejectCb(resp.errorMsg);
            }
        });
    },

    handleJoinIrcChannel(data, acceptCb, rejectCb) {
        socket.send({
            id: 'JOIN',
            name: data.name,
            network: data.network,
            password: data.password
        }, resp => {
            if (resp.status === 'OK') {
                acceptCb();
            } else {
                rejectCb(resp.errorMsg);
            }
        });
    },

    handleStartChat(data) {
        socket.send({
            id: 'CHAT',
            userId: data.userId
        }, resp  => {
            if (resp.status !== 'OK') {
                dispatch('OPEN_MODAL', {
                    name: 'info-modal',
                    model: {
                        title: 'Error',
                        body: resp.errorMsg
                    }
                });
            }
        });
    },

    handleFetchMessageRange(data, successCb) {
        socket.send({
            id: 'FETCH',
            windowId: data.window.get('windowId'),
            start: data.start,
            end: data.end
        }, resp => {
            data.window.get('logMessages').clearModels();
            data.window.get('logMessages').upsertModels(resp.msgs, { window: data.window });
            successCb();
        });
    },

    handleFetchOlderMessages(data, successCb) {
        socket.send({
            id: 'FETCH',
            windowId: data.window.get('windowId'),
            end: data.window.get('messages').sortBy('ts').get('firstObject').get('ts'),
            limit: 1000
        }, resp => {
            // Window messages are roughly sorted. First are old messages received by FETCH.
            // Then the messages received at startup and at runtime.
            data.window.get('messages').upsertModelsPrepend(resp.msgs, { window: data.window });

            successCb(resp.msgs.length !== 0);
        });
    },

    handleProcessLine(data) {
        let body = data.body;
        let command = false;
        let commandParams;

        if (body.charAt(0) === '/') {
            let data = /^(\S*)(.*)/.exec(body.substring(1));
            command = data[1] ? data[1].toLowerCase() : '';
            commandParams = data[2] ? data[2] : '';
        }

        let ircServer1on1 = data.window.get('type') === '1on1' &&
            data.window.get('userId') === 'iSERVER';

        if (ircServer1on1 && !command) {
            dispatch('ADD_ERROR', {
                body: 'Only commands allowed, e.g. /whois john',
                window: window
            });
        }

        if (command === 'help') {
            dispatch('OPEN_MODAL', { name: 'help-modal' });
            return;
        }

        // TBD: /me on an empty IRC channel is not shown to the sender.

        if (command) {
            dispatch('SEND_COMMAND', {
                command: command,
                params: commandParams.trim(),
                window: data.window
            });
            return;
        }

        dispatch('SEND_TEXT', {
            text: body,
            window: data.window
        });
    },

    handleEditMessage(data) {
        socket.send({
            id: 'EDIT',
            windowId: data.window.get('windowId'),
            gid: data.gid,
            text: data.body
        }, resp => {
            if (resp.status !== 'OK') {
                dispatch('OPEN_MODAL', {
                    name: 'info-modal',
                    model: {
                        title: 'Error',
                        body: resp.errorMsg
                    }
                });
            }
        });
    },

    handleAddWindow(data) {
        this.get('windows').upsertModel(data, { generation: socket.sessionId });
    },

    handleCloseWindow(data) {
        socket.send({
            id: 'CLOSE',
            windowId: data.window.get('windowId')
        });
    },

    handleDeleteWindow(data) {
        let window = this._getWindow(data.windowId);
        this.get('windows').removeModel(window);
    },

    handleLogout() {
        socket.send({
            id: 'LOGOUT'
        }, () => {
            $.removeCookie('auth', { path: '/' });

            if (typeof Storage !== 'undefined') {
                window.localStorage.removeItem('data');
            }

            window.location = '/';
        });
    },

    handleToggleTheme() {
        let newTheme = this.get('settings.theme') === 'dark' ? 'default' : 'dark';

        this.set('settings.theme', newTheme);
        socket.send({
            id: 'SET',
            settings: {
                theme: newTheme
            }
        });
    },

    handleUpdatePassword(data, successCb, rejectCb) {
        socket.send({
            id: 'UPDATE_PASSWORD',
            windowId: data.window.get('windowId'),
            password: data.password
        }, resp => {
            if (resp.status === 'OK') {
                successCb();
            } else {
                rejectCb(resp.errorMsg);
            }
        });
    },

    handleUpdateProfile(data, successCb, rejectCb) {
        socket.send({
            id: 'UPDATE_PROFILE',
            name: data.name,
            email: data.email
        }, resp => {
            if (resp.status === 'OK') {
                // Don't nag about unconfirmed email address anymore in this session
                this.set('settings.emailConfirmed', true);
                successCb();
            } else {
                rejectCb(resp.errorMsg);
            }
        });
    },

    handleFetchProfile() {
        socket.send({
            id: 'GET_PROFILE'
        }, resp => {
            this.set('profile.name', resp.name);
            this.set('profile.email', resp.email);
            this.set('profile.nick', resp.nick);
        });
    },

    handleUpdateTopic(data) {
        socket.send({
            id: 'UPDATE_TOPIC',
            windowId: data.window.get('windowId'),
            topic: data.topic
        });
    },

    handleConfirmEmail(data, successCb) {
        socket.send({
            id: 'SEND_CONFIRM_EMAIL'
        }, () => {
            dispatch('SHOW_ALERT', {
                message: 'Confirmation link sent. Check your spam folder if you don\'t see it in inbox.',
                dismissible: true,
                report: false,
                postponeLabel: false,
                ackLabel: 'Okay'
            });

            this.set('emailConfirmed', true);
        });
    },

    handleShowAlert(data) {
        this.get('alerts').upsertModel(data);
    },

    handleMoveWindow(data) {
        let props = [ 'column', 'row', 'desktop' ];

        for (let prop of props) {
            if (data.hasOwnProperty(prop)) {
                data.window.set(prop, data[prop]);
            }
        }

        if (!isMobile.any) {
            socket.send({
                id: 'UPDATE',
                windowId: data.window.get('windowId'),
                desktop: data.desktop,
                column: data.column,
                row: data.row
            });
        }
    },

    handleToggleMemberListWidth(data) {
        let newValue = data.window.toggleProperty('minimizedNamesList');

        socket.send({
            id: 'UPDATE',
            windowId: data.window.get('windowId'),
            minimizedNamesList: newValue
        });
    },

    handleChangeActiveDesktop(data) {
        this.set('settings.activeDesktop', data.desktop);

        if (!isMobile.any) {
            socket.send({
                id: 'SET',
                settings: {
                    activeDesktop: data.desktop
                }
            });
        }
    },

    handleSeekActiveDesktop(data) {
        let desktops = this.get('desktops');
        let activeDesktop = this.get('settings.activeDesktop');
        let index = desktops.indexOf(desktops.findBy('id', activeDesktop));

        index += data.direction;

        if (index === desktops.length) {
            index = 0;
        } else if (index < 0) {
            index = desktops.length - 1;
        }

        dispatch('CHANGE_ACTIVE_DESKTOP', {
            desktop: desktops[index].id
        });
    },

    handleUpdateSettings(data) {
        if (isMobile.any) {
            data.settings.activeDesktop = 1;
        }

        this.get('settings').setProperties(data.settings);
    },

    handleUpdateNetworks(data) {
        this.get('networks').setObjects(data.networks);
    },

    handleAddAlert(data) {
        // Default labels for alerts
        data.postponeLabel = 'Show again later';
        data.ackLabel = 'Dismiss';

        data.resultCallback = result => {
            if (result === 'ack') {
                socket.send({
                    id: 'ACKALERT',
                    alertId: data.alertId
                });
            }
        };

        this.get('alerts').upsertModel(data);
    },

    handleFinishStartup() {
        // Remove possible deleted windows.
        let deletedWindows = [];

        this.get('windows').forEach(windowObject => {
            if (windowObject.get('generation') !== socket.sessionId) {
                deletedWindows.push(windowObject);
            }
        });

        this.get('windows').removeModels(deletedWindows);

        // Insert buffered message in one go.
        Ember.Logger.info(`MsgBuffer processing started.`);

        for (let i = 0; i < this.msgBuffer.length; i++) {
            let item = this.msgBuffer[i];
            item.window.messages.upsertModel(item);
        }

        Ember.Logger.info(`MsgBuffer processing ended.`);

        this.msgBuffer = [];
        this.set('initDone', true);
    },

    handleAddMembers(data) {
        let window = this._getWindow(data.windowId);

        if (data.reset) {
            window.operators.clear();
            window.voices.clear();
            window.users.clear();
        }

        data.members.forEach(member => {
            let userId = member.userId;

            if (!data.reset) {
                this._removeUser(userId, data.window);
            }

            switch (member.role) {
                case '@':
                    window.operators.pushObject(userId);
                    break;
                case '+':
                    window.voices.pushObject(userId);
                    break;
                default:
                    window.users.pushObject(userId);
                    break;
            }
        });
    },

    handleDeleteMembers(data) {
        let window = this._getWindow(data.windowId);

        data.members.forEach(member => {
            this._removeUser(member.userId, window);
        });
    },

    handleUpdateWindow(data) {
        let window = this._getWindow(data.windowId);
        window.setModelProperties(data);
    },

    handleUpsertUsers(data) {
        for (let userId in data.mapping) {
            this.set('users.users.' + userId, data.mapping[userId]);
        }

        this.get('users').incrementProperty('isDirty');
    },

    _removeUser(userId, window) {
        window.operators.removeObject(userId);
        window.voices.removeObject(userId);
        window.users.removeObject(userId);
    },

    _getWindow(windowId) {
        return this.get('windows').getByIndex(windowId);
    }
}).create();