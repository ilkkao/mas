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

App.MainController = Ember.ArrayController.extend({
    actions: {
        show: function(window) {
            window.set('hidden', false);
        }
    },

    sortedVisibleWindows: function() {
        return this.get('model').filter(function(val) {
            return !val.get('hidden');
        }).sortBy('row');
    }.property('model.@each.hidden', 'model.@each.row'),

    sortedHiddenWindows: function() {
        return this.get('model').filter(function(val) {
            return val.get('hidden');
        }).sortBy('row');
    }.property('model.@each.hidden', 'model.@each.row'),

    nextRow: function(item, direction) {
        var windows = this.get('sortedWindows');
        var index =  windows.indexOf(item);
        var row = windows[index].get('row');

        for (var i = index + direction; i >= 0 && i < windows.length; i += direction) {
            var currentRow = windows[i].get('row');

            if (currentRow !== row) {
                return currentRow;
            }
        }

        return row + direction;
    }
});
