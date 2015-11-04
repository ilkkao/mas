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

const path = require('path'),
      assert = require('assert'),
      fs = require('fs'),
      nconf = require('nconf'),
      argv = require('yargs').argv;

require('colors');

let configFileOption = argv.configFile;
let configFile;

if (configFileOption && configFileOption.charAt(0) === path.sep) {
    // Absolute path
    configFile = path.normalize(configFileOption);
} else {
    configFile = path.join(__dirname, '..', '..', configFileOption || 'mas.conf');
}

if (!fs.existsSync(configFile)) {
    const msg = 'ERROR: '.red + `Config file ${configFile} missing.`;
    console.error(msg); // eslint-disable-line no-console
    process.exit(1);
}

nconf.argv().add('file', {
    file: configFile,
    format: nconf.formats.ini
});

exports.get = function(key) {
    return get(key);
};

exports.getComputed = function(key) {
    let ret = '';

    switch (key) {
        case 'site_url':
            ret = get('site:site_url');

            if (ret.endsWith('/')) {
                ret = ret.substring(0, ret.length - 1);
            }
            break;

        default:
            assert(0);
    }

    return ret;
};

function get(key) {
    let value = nconf.get(key);

    if (value === undefined) {
        // TODO: Add config validator, allows very early exit
        console.error(`Config variable missing in the config file: ${key}`);
        process.exit(1);
    }

    return value;
}
