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

Mas.Window = Ember.Object.extend({
    init: function() {
        this._super();

        this.messages = Ember.A([]);
        this.operators = Ember.A([]);
        this.voices = Ember.A([]);
        this.users = Ember.A([]);
    },

    windowId: 0,
    name: null,
    network: null,
    type: null,
    row: null,
    visible: false,
    messages: null,

    newMessagesCount: 0,
    scrollLock: false,
    deletedLine: false,
    initDone: false,

    operators: null,
    voices: null,
    users: null,

    firstInRow: false,
    lastInRow: false,

    simplifiedName: function() {
        var name = this.get('name');
        name = name.replace(/[&\/\\#,+()$~%.'":*?<>{}]/g, '');
        return name;
    }.property('name'),

    tooltipTopic: function() {
        return 'Topic: ' + this.get('topic');
    }.property('topic'),

    syncServer: function() {
        Mas.networkMgr.send({
            id: 'UPDATE',
            windowId: this.get('windowId'),
            row: this.get('row'),
            visible: this.get('visible')
        });
    }.observes('visible', 'row')
});
