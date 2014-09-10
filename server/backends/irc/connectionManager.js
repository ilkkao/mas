#!/usr/bin/env node --harmony
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

'use strict';

// Minimal connection manager that keeps TCP sockets alive even if
// rest of the system is restarted. Allows nondistruptive updates.

require('../../lib/init')('irc-connman');

var net = require('net'),
    carrier = require('carrier'),
    isUtf8 = require('is-utf8'),
    iconv = require('iconv-lite'),
    conf = require('../../lib/conf'),
    log = require('../../lib/log'),
    courier = require('../../lib/courier').createEndPoint('connectionmanager');

var sockets = {};
var nextNetworkConnectionSlot = {};

const IDENTD_PORT = 113;

courier.sendNoWait('ircparser', 'restarted');

// Start IDENT server
if (conf.get('irc:identd')) {
    net.createServer(handleIdentConnection).listen(IDENTD_PORT);
}

function handleIdentConnection(conn) {
    var timer = setTimeout(function() {
        if (conn) {
            conn.destroy();
        }
    }, 3000);

    carrier.carry(conn, function(line) {
        var ports = line.split(',');
        var localPort = parseInt(ports[0]);
        var remotePort = parseInt(ports[1]);
        var prefix = localPort + ', ' + remotePort;
        var found = false;
        var resp;

        if (!isNaN(localPort) && !isNaN(remotePort)) {
            for (var userId in sockets) {
                if (sockets[userId].localPort === localPort &&
                    sockets[userId].remotePort === remotePort &&
                    sockets[userId].remoteAddress === conn.remoteAddress) {
                    found = true;
                    resp = prefix + ' : USERID : UNIX : ' + sockets[userId].nick + '\r\n';
                    break;
                }
            }

            if (!found) {
                resp = prefix + ' : ERROR : NO-USER\r\n';
            }
        }

        clearTimeout(timer);

        if (resp) {
            conn.write(resp);
        }
        conn.end();

        log.info('Ident request from ' + conn.remoteAddress + ', req: ' + line +', resp: ' + resp);
    });
}

// Connect
courier.on('connect', function(params) {
    var network = params.network;

    var options = {
        host: conf.get('irc:networks:' + network + ':host'),
        port: conf.get('irc:networks:' + network + ':port')
    };

    if (!nextNetworkConnectionSlot[network]) {
        nextNetworkConnectionSlot = Date.now();
    }

    var delay = nextNetworkConnectionSlot[network] - Date.now;
    var rateLimit = conf.get('irc:networks:' + network + ':rate_limit'); // connections per minute

    nextNetworkConnectionSlot[network] += Math.round(60 / rateLimit * 1000);

    setTimeout(function() {
        connect(options, params.userId, params.nick, network);
    }, delay);
});

function connect(options, userId, nick, network) {
    var pingTimer;
    var client = net.connect(options);
    client.nick = nick;

    client.setKeepAlive(true, 2 * 60 * 1000); // 2 minutes

    function sendPing() {
        client.write('PING ' + options.host + '\r\n');
    }

    client.on('connect', function() {
        courier.sendNoWait('ircparser', {
            type: 'connected',
            userId: userId,
            network: network
        });

        pingTimer = setInterval(sendPing, 60 * 1000);
    });

    var buffer = '';

    client.on('data', function(data) {
        // IRC protocol doesn't have character set concept, we need to guess.
        // Algorithm is simple. If received binary data is valid utf8 then use
        // that. Else assume that the character set is iso-8859-15.
        data = isUtf8(data) ? data.toString() : iconv.decode(data, 'iso-8859-15');
        data = buffer + data;

        var lines = data.split(/\r\n/);
        buffer = lines.pop(); // Save the potential partial line to buffer

        lines.forEach(function(line) {
            courier.sendNoWait('ircparser', {
                type: 'data',
                userId: userId,
                network: network,
                line: line
            });
        });
    });

    client.on('close', function(had_error) {
        log.info(userId, 'IRC connection closed by the server or network.');
        courier.sendNoWait('ircparser', {
            type: 'disconnected',
            userId: userId,
            network: network,
            reason: had_error ? 'transmission error' : 'connection closed by the server'
        });

        clearInterval(pingTimer);
    });

    sockets[userId + ':' + network] = client;
}

// Disconnect
courier.on('disconnect', function(params) {
    var userId = params.userId;
    var network = params.network;

    sockets[userId + ':' + network].end();
    delete sockets[userId + ':' + network];
});

// Write
courier.on('write', function(params) {
    var userId = params.userId;
    var network = params.network;
    var data = params.line;

    if (!sockets[userId + ':' + network]) {
        log.warn(userId, 'Non-existent socket');
        return;
    }

    if (typeof(data) === 'string') {
        data = [data];
    }

    for (var i = 0; i < data.length; i++) {
        sockets[userId + ':' + network].write(data[i] + '\r\n');
    }
});

courier.start();
