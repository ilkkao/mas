//
//   Copyright 2014-2016 Ilkka Oksanen <iao@iki.fi>
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

const rigiddb = require('rigiddb');

const db = new rigiddb('mas', { db: 10 });

module.exports = class Model {
    constructor(collection, id = null) {
        if (collection === 'models') {
            throw new Error('An abstract Model class cannot be instantiated.');
        }

        this.collection = collection;
        this.id = id;
        this.errors = {};

        this._props = {};
    }

    get config() {
        // Default configuration. Can be overwritten in derived classes.
        return {
            validator: false,
            allowedProps: false,
            indexErrorDescriptions: {}
        };
    }

    static get collection() {
        return this.name.toLowerCase() + 's'; // TBD: Construct real plural
    }

    get valid() {
        return Object.keys(this.errors).length === 0;
    }

    static *fetch(id) {
        let record = new this(this.collection, id);

        const { error, val } = yield db.get(record.collection, id);

        if (error) {
            return null;
        }

        record._props = val;
        return record;
    }

    static *findFirst(value, field) {
        if (!value) {
            return null;
        }

        const { val } = yield db.find(this.collection, { [field]: value });

        if (!val || val.length === 0) {
            return null;
        }

        const id = val[0];

        return yield this.fetch(id);
    }

    static *create(props) {
        let record = new this(this.collection);

        if (record.config.validator) {
            const { valid, errors } = record.config.validator.validate(props);

            if (!valid) {
                record.errors = errors;
            }
        }

        if (record.valid) {
            const { err, val, indices } = yield db.create(record.collection, props);

            if (err === 'notUnique') {
                record.errors = explainIndexErrors(indices, record.config.indexErrorDescriptions);
            } else if (err) {
                throw new Error('DB error');
            } else {
                record.id = val;
                record._props = props;
            }
        }

        return record;
    }

    get(prop) {
        return this._props[prop];
    }

    *set(props, value) {
        props = convertToObject(props, value);

        if (this.validator) {
            const { valid, errors } = this.config.validator.validate(props);

            if (!valid) {
                this.errors = errors;
                return props;
            }
        }

        const { err, indices } = yield db.update(this.collection, this.id, props);

        if (err === 'notUnique') {
            this.errors = explainIndexErrors(indices, this.config.indexErrorDescriptions);
        } else if (err) {
            throw new Error('DB error');
        } else {
            this.errors = {};
            Object.assign(this._props, props);
        }

        return props;
    }

    *setProperty(props, value) {
        props = convertToObject(props, value);

        for (const prop of Object.keys(props)) {
            if (this.config.allowedProps && !this.config.allowedProps.includes(prop)) {
                throw new Error(`Tried to set invalid user model property ${prop}`);
            }
        }

        return yield this.set(props);
    }

    *delete() {
        const { val } = yield db.delete(this.collection, this.id);

        return val;
    }
};

function convertToObject(props, value) {
    if (!props) {
        return false;
    } else if (typeof(props) === 'string') {
        props = { [props]: value };
    }

    return props;
}

function explainIndexErrors(indices, descriptions = {}) {
    let errors = {};

    indices.forEach(index => errors[index] = descriptions[index] || `Bad index.`)

    return errors;
}
