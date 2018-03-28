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

import { computed } from '@ember/object';

import { alias } from '@ember/object/computed';
import { inject as service } from '@ember/service';
import Component from '@ember/component';
import { dispatch } from '../../../utils/dispatcher';

export default Component.extend({
  stores: service(),

  userId: alias('model'),

  name: computed('userId', function() {
    return this.get('stores.users.users')
      .getByIndex(this.get('userId'))
      .get('name');
  }),

  nick: computed('userId', function() {
    return this.get('stores.users.users')
      .getByIndex(this.get('userId'))
      .get('nick').MAS;
  }),

  actions: {
    remove() {
      dispatch('REMOVE_FRIEND', {
        userId: this.get('userId')
      });

      this.sendAction('closeModal');
    },

    closeModal() {
      this.sendAction('closeModal');
    }
  }
});
