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

import { computed } from '@ember/object';
import BaseModel from './base';

export default BaseModel.extend({
  userId: null,

  _usersStore: null,

  init() {
    this._super();
    this.set('_usersStore', window.stores.users);
  },

  name: computed('_usersStore.isDirty', function() {
    const userId = this.userId;
    return this.get('_usersStore.users')
      .getByIndex(userId)
      .get('name');
  })
});
