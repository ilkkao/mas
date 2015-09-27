//
//   Copyright 2009-2015 Ilkka Oksanen <iao@iki.fi>
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
    editBody: null,
    previousEditedMessage: null,

    actions: {
        toggleImages(message) {
            message.toggleProperty('hideImages');
        },

        edit(message) {
            this._endEdit();

            this.set('editBody', message.get('body'));
            message.set('editing', true); // TBD: Mutates store

            this.set('previousEditedMessage', message);
        },

        change(message) {
            this.sendAction('editMessage', message.gid, this.get('editBody'));
            this._endEdit();
        },

        cancel(message) {
            this._endEdit();
        },

        delete(message) {
            this.sendAction('deleteMessage', message.gid);
            this._endEdit();
        }
    },

    _endEdit() {
        let previousEditedMessage = this.get('previousEditedMessage');

        if (previousEditedMessage) {
            previousEditedMessage.set('editing', false); // TBD: Mutates store
            this.set('previousEditedMessage', null);
        }
    }
});
