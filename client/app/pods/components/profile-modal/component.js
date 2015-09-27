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

import Ember from 'ember';

export default Ember.Component.extend({
    action: Ember.inject.service(),
    store: Ember.inject.service(),

    name: Ember.computed.alias('store.profile.name'),
    email: Ember.computed.alias('store.profile.email'),
    nick: Ember.computed.alias('store.profile.nick'),

    errorMsg: '',

    actions: {
        edit() {
            this.get('action').dispatch('UPDATE_PROFILE', {
                name: this.get('name'),
                email: this.get('email')
            },
            () => this.sendAction('closeModal'), // Accept
            reason => this.set('errorMsg', reason)); // Reject
        },

        terminate() {
            this.get('action').dispatch('OPEN_MODAL', {
                name: 'confirm-delete-account-modal'
            });
            this.sendAction('closeModal');
        },

        closeModal() {
            this.sendAction('closeModal');
        }
    },

    didInsertElement() {
        this.get('action').dispatch('FETCH_PROFILE');
    }
});
