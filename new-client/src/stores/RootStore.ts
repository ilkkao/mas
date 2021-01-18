import AlertStore from './AlertStore';
import DaySeparatorStore from './DaySeparatorStore';
import FriendStore from './FriendStore';
import ModalStore from './ModalStore';
import NetworkStore from './NetworkStore';
import ProfileStore from './ProfileStore';
import SettingStore from './SettingStore';
import UserStore from './UserStore';
import WindowStore from './WindowStore';
import { Notification } from '../types/notifications';
import Socket from '../lib/socket';

interface Store {
  handlerServerNotification(ntf: Notification): boolean;
}

class RootStore {
  alertStore: AlertStore;
  daySeparatorStore: DaySeparatorStore;
  friendStore: FriendStore;
  modalStore: ModalStore;
  networkStore: NetworkStore;
  profileStore: ProfileStore;
  settingStore: SettingStore;
  userStore: UserStore;
  windowStore: WindowStore;

  stores: Array<Store>;

  constructor() {
    const socket = new Socket(this);

    this.alertStore = new AlertStore(this, socket);
    this.daySeparatorStore = new DaySeparatorStore(this, socket);
    this.friendStore = new FriendStore(this, socket);
    this.modalStore = new ModalStore(this, socket);
    this.networkStore = new NetworkStore(this, socket);
    this.profileStore = new ProfileStore(this, socket);
    this.settingStore = new SettingStore(this, socket);
    this.userStore = new UserStore(this, socket);
    this.windowStore = new WindowStore(this, socket);

    this.stores = [
      this.alertStore,
      this.daySeparatorStore,
      this.friendStore,
      this.modalStore,
      this.networkStore,
      this.profileStore,
      this.settingStore,
      this.userStore,
      this.windowStore
    ];
  }

  dispatch(ntf: Notification): void {
    for (const store of Object.values(this.stores)) {
      if (store.handlerServerNotification(ntf)) {
        return;
      }
    }

    console.error(`No store handled action: ${ntf.type}`);
  }
}

export default RootStore;
