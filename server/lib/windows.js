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

'use strict';

var redis = require('./redis').createClient(),
    log = require('./log');

exports.getWindowIdsForNetwork = function *(userId, network) {
    var ids = yield getWindowIds(userId, network, null, 'id');

    return ids;
};

exports.getWindowId = function *(userId, network, name) {
    var ids = yield getWindowIds(userId, network, name, 'id');

    if (ids.length === 1) {
        return ids[0];
    } else {
        log.warn(userId, 'Tried to find non-existing window: ' + name);
        return null;
    }
};

exports.getWindowNameAndNetwork = function *(userId, windowId) {
    var windows = yield redis.smembers('windowlist:' + userId);

    for (var i = 0; i < windows.length; i++) {
        var details = windows[i].split(':');
        if (parseInt(details[0]) === windowId) {
            return [ details[2],  details[1] ];
        }
    }

    return [ null, null ];
};

exports.getWindowNamesForNetwork = function *(userId, network) {
    var ids = yield getWindowIds(userId, network, null, 'name');

    return ids;
};

exports.getNetworks = function *(userId) {
    var networks = {};

    var windows = yield redis.smembers('windowlist:' + userId);
    for (var i = 0; i < windows.length; i++) {
        var details = windows[i].split(':');
        var windowNetwork = details[1];

        networks[windowNetwork] = true;
    }

    return Object.keys(networks);
};

exports.createNewWindow = function *(userId, network, name, password, type) {
    var windowId = yield redis.hincrby('user:' + userId, 'nextwindowid', 1);

    var newWindow = {
        windowId: windowId,
        network: network,

        name: name,
        type: type,
        sounds: false,
        titleAlert: false,
        userMode: 'owner',
        visible: true,
        password: password,
        topic: ''
    };

    yield redis.hmset('window:' + userId + ':' + windowId, newWindow);
    yield redis.sadd('windowlist:' + userId, windowId + ':' + network + ':' + name);

    newWindow.id = 'CREATE';
    return newWindow;
};

function *getWindowIds(userId, network, name, returnType) {
    var windows = yield redis.smembers('windowlist:' + userId);
    var ret = [];

    for (var i = 0; i < windows.length; i++) {
        var details = windows[i].split(':');
        var windowId = parseInt(details[0]);
        var windowNetwork = details[1];
        var windowName = details[2];

        if (windowNetwork === network && (!name || windowName === name)) {
            if (returnType === 'id') {
                ret.push(windowId);
            } else if (returnType === 'name') {
                ret.push(windowName);
            }
        }
    }

    return ret;
}
