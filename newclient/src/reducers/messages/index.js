import { Map } from 'immutable';
import * as types from '../../actions/messages/types';

const initialState = {
  messages: Map()
};

export default function messages(state = initialState, action) {
  switch (action.type) {
    default:
      return state;
  }
}
