//
//   Copyright 2014-2015 Ilkka Oksanen <iao@iki.fi>
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

checkNodeVersion();

const assert = require('assert');
const semver = require('semver');
const log = require('./log');

const stateChangeCallbacks = [];
let shutdownInProgress = false;

const shutdownOrder = {
    beforeShutdown: 1,
    shutdown: 2,
    afterShutdown: 3
};

process.on('unhandledRejection', (reason, p) => {
    log.warn(`Unhandled Rejection at: Promise ${p}, reason: ${reason}`);
    throw reason;
});

exports.configureProcess = function configureProcess(serverName) {
    process.umask(18); // file: rw-r--r-- directory: rwxr-xr-x
    process.title = `mas-${serverName}`;

    log.warn(`${serverName} starting...`);

    process.on('SIGINT', execShutdown);
    process.on('SIGTERM', execShutdown);
};

exports.on = function on(state, callback) {
    assert(shutdownOrder[state]);

    stateChangeCallbacks.push({ state, cb: callback });
};

exports.shutdown = function shutdown() {
    execShutdown();
};

async function execShutdown() {
    if (shutdownInProgress) {
        return;
    }

    shutdownInProgress = true;

    log.warn('Shutdown sequence started.');

    const entries = stateChangeCallbacks.sort(
        (a, b) => shutdownOrder[a.state] - shutdownOrder[b.state]);

    for (const entry of entries) {
        await entry.cb();
    }

    console.log('Shutdown complete.'); // eslint-disable-line no-console
    process.exit();
}

function checkNodeVersion() {
    if (semver.lt(process.version, 'v7.6.0')) {
        console.error('ERROR: Installed Node.js version must be at least v7.6.0');
        process.exit(1);
    }
}
