// Socket.io events
export enum Event {
    CONNECT = 'connect',
    DISCONNECT = 'disconnect',
    NEW_MESSAGE = 'new_message',
    NEW_OSC = 'new_osc',
    NOTIFY_OSC = 'notify_osc',
    OSC_CHANGE = 'osc_change',
    NOTIFY_OSC_CHANGE = 'notify_osc_change',
    KEY_EVENT = 'key_event',
    NOTIFY_KEY_EVENT = 'notify_key_event'
}  