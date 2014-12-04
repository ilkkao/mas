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

import Ember from 'ember';
import network from '../helpers/network';

export function initialize(container, application) {
    var friends = Ember.A([]);
    var nicks = {};

    var newNetwork = network.create({
        friendsModel: friends,
        nicksModel: nicks
    });

    application.register('network:main', newNetwork, { instantiate: false });
    application.inject('controller', 'network', 'network:main');

    application.register('model:friends', friends, { instantiate: false });
    application.inject('controller', 'friends', 'model:friends');

    application.register('model:nicks', nicks, { instantiate: false });
    application.inject('controller', 'nicks', 'model:nicks');
}

export default {
  name: 'setup',
  initialize: initialize
};
