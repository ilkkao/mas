import Mobx from 'mobx';
import WindowStore from '../stores/WindowStore';

const { computed, observable } = Mobx;

export default class SettingModel {
  @observable theme = 'default';
  @observable activeDesktop = 0;
  @observable email = ''; // TODO: Remove from here, keep in profile
  @observable emailConfirmed = true;
  @observable canUseIRC = false;

  constructor(store, props) {
    Object.assign(this, props);
  }
}
