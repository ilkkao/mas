import { computed, observable, makeObservable } from 'mobx';
import marked from 'marked';
import dayjs from 'dayjs';
import URI from 'urijs';
import WindowModel from './Window';
import UserModel, { me } from './User';
import emoticons from '../lib/emoticons';
import { MessageCategory, MessageRecord } from '../types/notifications';

type BodyPart = { type: string; text?: string; url?: string; start?: number };

marked.setOptions({
  breaks: true
});

export default class MessageModel {
  me: UserModel;

  constructor(
    public readonly gid: number,
    public body: string | undefined = undefined,
    public readonly cat:
      | 'msg'
      | 'join'
      | 'part'
      | 'quit'
      | 'kick'
      | 'day-divider'
      | 'error'
      | 'info'
      | 'server'
      | 'banner'
      | 'action',
    public readonly ts: number,
    public readonly user: UserModel,
    public readonly window: WindowModel,
    public status: 'original' | 'deleted' | 'edited' = 'original',
    public updatedTs: number | null = null,
    public readonly hideImages: boolean = false,
    public readonly editing: boolean = false,
    public readonly ircMotd: boolean = false
  ) {
    this.me = me;

    makeObservable(this, {
      body: observable,
      status: observable,
      updatedTs: observable,
      hideImages: observable,
      editing: observable,
      edited: computed,
      deleted: computed,
      updatedTime: computed,
      updatedDate: computed,
      updatedDateLong: computed,
      nick: computed,
      avatarUrl: computed,
      decoratedCat: computed,
      decoratedTs: computed,
      channelAction: computed,
      myNotDeletedMessage: computed,
      bodyParts: computed,
      text: computed,
      images: computed,
      hasMedia: computed,
      hasImages: computed,
      hasYoutubeVideo: computed,
      videoId: computed,
      videoParams: computed
    });
  }

  get edited(): boolean {
    return this.status === 'edited';
  }

  get deleted(): boolean {
    return this.status === 'deleted';
  }

  get updatedTime(): string {
    const updatedTs = this.updatedTs;

    if (!updatedTs) {
      return '';
    }

    const originalTime = dayjs.unix(this.ts);
    const updatedTime = dayjs.unix(updatedTs);

    return `at ${updatedTime.format(originalTime.isSame(updatedTime, 'd') ? 'HH:mm' : 'MMM Do HH:mm')}`;
  }

  get updatedDate(): string {
    const updatedTs = this.updatedTs;

    return updatedTs ? `at ${dayjs.unix(updatedTs).format('MMM Do HH:mm')}` : '';
  }

  get updatedDateLong(): string {
    const updatedTs = this.updatedTs;

    return updatedTs ? `at ${dayjs.unix(updatedTs).format('dddd, MMMM D HH:mm')}` : '';
  }

  get nick(): string | undefined {
    if (!this.window.network) {
      return undefined;
    }

    return this.user.nick[this.window.network];
  }

  get avatarUrl(): string {
    return `//gravatar.com/avatar/${this.user.gravatar}?d=mm`;
  }

  get decoratedCat(): MessageCategory | 'mention' | 'mymsg' | 'service' | 'day-divider' {
    const cat = this.cat;
    const body = this.body;
    const nick = this.nick;

    const myNick = this.me.nick[this.window.network];
    const mentionedRegEx = new RegExp(`(^|[@ ])${myNick}[ :]`);

    if (body && mentionedRegEx.test(body) && cat === 'msg') {
      return 'mention';
    }

    if (this.user === this.me && cat === 'msg') {
      return 'mymsg';
    }

    if (nick === 'ruuskanen') {
      return 'service';
    }

    return cat;
  }

  get decoratedTs(): string {
    return dayjs.unix(this.ts).format('HH:mm');
  }

  get channelAction(): string {
    const nick = this.nick;
    const groupName = this.window.name;
    const body = this.body;

    switch (this.cat) {
      case 'join':
        return `${nick} has joined ${groupName}.`;
      case 'part':
        return `${nick} has left ${groupName}. ${body}`;
      case 'quit':
        return `${nick} has quit irc. Reason: ${body}`;
      case 'kick':
        return `${nick} was kicked from ${groupName}. Reason: ${body}`;
      default:
        return '';
    }
  }

  get myNotDeletedMessage(): boolean {
    return this.decoratedCat === 'mymsg' && this.status !== 'deleted';
  }

  get bodyParts(): Array<BodyPart> {
    let body = this.body;
    const cat = this.cat;

    let parts: Array<BodyPart> = [];

    if (cat === 'msg' && body) {
      ({ body, parts } = this.parseLinks(body));
      body = marked(body);
      body = this.parseCustomFormatting(body);
    } else if (body) {
      body = this.escapeHTMLStartTag(body);
    }

    if (body) {
      body = this.parseWhiteSpace(body);
    }

    parts.push({ type: 'text', text: body });

    return parts;
  }

  get text(): string | undefined {
    return this.bodyParts.find(part => part.type === 'text')?.text;
  }

  get images(): BodyPart[] {
    return this.bodyParts.filter(part => part.type === 'image');
  }

  get hasMedia(): boolean {
    return !this.bodyParts.every(part => part.type === 'text');
  }

  get hasImages(): boolean {
    return this.bodyParts.some(part => part.type === 'image');
  }

  get hasYoutubeVideo(): boolean {
    return this.bodyParts.some(part => part.type === 'youtubelink');
  }

  get videoId(): string | undefined {
    const video = this.bodyParts.find(part => part.type === 'youtubelink');

    if (video) {
      const urlObj = new URI(video.url);
      // Format is https://www.youtube.com/watch?v=0P7O69GuCII or https://youtu.be/0P7O69GuCII
      const vParam = urlObj.search(true).v;

      if (vParam) {
        return Array.isArray(vParam) ? vParam[0] || undefined : vParam;
      } else {
        return urlObj.pathname().substring(1).split('/')[0];
      }
    }
  }

  get videoParams(): string {
    const video = this.bodyParts.find(part => part.type === 'youtubelink');
    const start = video && (video.start ? `&start=${video.start}` : '');

    return `showinfo=0&autohide=1${start}`;
  }

  updateFromRecord(message: MessageRecord): void {
    this.body = message.body;
    this.status = message.status;
    this.updatedTs = typeof message.updatedTs !== 'undefined' ? message.updatedTs : this.updatedTs;
  }

  private splitByLinks(text: string) {
    const parts = [];
    let previousEnd = 0;

    URI.withinString(text, (url, start: number, end: number) => {
      if (previousEnd !== start) {
        parts.push({ type: 'txt', data: text.substring(previousEnd, start) });
      }

      parts.push({ type: 'url', data: url });
      previousEnd = end;

      return '';
    });

    if (previousEnd !== text.length) {
      parts.push({ type: 'txt', data: text.substring(previousEnd) });
    }

    return parts;
  }

  private parseLinks(text: string) {
    const imgSuffixes = ['png', 'jpg', 'jpeg', 'gif'];
    const media = [];
    let body = '';

    const parts = this.splitByLinks(text);

    for (const part of parts) {
      if (part.type === 'url') {
        const urlObj = new URI(part.data);
        let visibleLink;
        const domain = urlObj.domain();

        if (imgSuffixes.indexOf(urlObj.suffix().toLowerCase()) !== -1) {
          visibleLink = decodeURIComponent(urlObj.filename());
          media.push({ type: 'image', url: urlObj.toString() });
        } else if ((domain === 'youtube.com' && urlObj.search(true).v) || domain === 'youtu.be') {
          visibleLink = urlObj.toString();

          let startTime = urlObj.search(true).t;

          if (Array.isArray(startTime)) {
            startTime = startTime[0];
          }

          let inSeconds = 0;

          if (startTime) {
            const re = startTime.match(/^(?:(\d{1,2})h)?(?:(\d{1,2})m)?(?:(\d{1,2})s)?$/);

            if (re) {
              inSeconds = parseInt(re[1] || '0') * 3600 + parseInt(re[2] || '0') * 60 + parseInt(re[3] || '0');
            }
          }

          media.push({
            type: 'youtubelink',
            url: urlObj.toString(),
            start: inSeconds
          });
        } else {
          visibleLink = urlObj.readable();
        }

        if (urlObj.protocol() === '') {
          urlObj.protocol('http');
        }

        let normalized;

        try {
          normalized = urlObj.normalize();
        } catch (e) {
          normalized = urlObj;
        }

        body += this.renderLink(normalized.toString(), this.escapeHTMLStartTag(visibleLink));
      } else {
        body += this.escapeHTMLStartTag(part.data);
      }
    }

    return { body, parts: media };
  }

  private parseWhiteSpace(text: string) {
    return text.replace(/ {2}/g, ' &nbsp;'); // Preserve whitespace.
  }

  private parseCustomFormatting(text: string) {
    let result;

    // Find @ character 1) after space, 2) in the beginning of string, 3) after HTML tag (>)
    result = text.replace(/(^| |>)(@\S+)(?=( |$))/g, (match, p1, p2) => this.renderMention(p1, p2));

    result = result.replace(/:\S+?:/g, match => {
      const emoji = emoticons[match];

      if (emoji) {
        return this.renderEmoji(match, emoji);
      }
      return match;
    });

    const keywords = result.match(/<(p|br)>/g);

    // Assumes that marked is used which inserts at least one <p>, <ol>, or <ul>
    const multiLine = !keywords || keywords.length > 1;

    if (!multiLine) {
      result = result.replace(/(\s*<p>|<\/p>\s*)/g, '');
    }

    return result;
  }

  private renderLink(url: string, label: string) {
    return `<a href="${url}" target="_blank">${label}</a>`;
  }

  private renderEmoji(name: string, src: string) {
    return `<img align="absmiddle" alt="${name}" title="${name}" class="emoji" src="https://twemoji.maxcdn.com/v/latest/72x72/${src}.png"/>`;
  }

  private renderMention(beforeCharacter: string, nick: string) {
    return `${beforeCharacter}<span class="nick-mention">${nick}</span>`;
  }

  private escapeHTMLStartTag(text: string) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }
}
