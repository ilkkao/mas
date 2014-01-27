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

var wrapper = require('co-redis'),
    redis = wrapper(require('redis').createClient());

exports.reset = function *(userId) {
    yield redis.del('outbox:' + userId);
}

exports.queue = function *(userId) {
    for (var i = 1; i < arguments.length; i++){
        yield redis.lpush('outbox:' + userId, JSON.stringify(arguments[i]));
    }
};

exports.flush = function *(userId, timeout) {
    var result,
        command;

    w.info('[' + userId + '] Flushing outbox.');

    var msg = {
        status: 'OK',
        commands: []
    }

    if (timeout) {
        // Wait for first command to appear if timeout is given
        result = yield redis.brpop('outbox:' + userId, timeout);

        if (result) {
            command = result[1];
            msg.commands.push(JSON.parse(command));
        }
    }

    // Retrieve other commands if there are any
    while (command = yield redis.rpop('outbox:' + userId)) {
        msg.commands.push(JSON.parse(command));
    }

    return msg;
};

exports.length = function *(userId) {
    return parseInt(yield redis.llen('outbox:' + userId));
};
