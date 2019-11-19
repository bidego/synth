
import * as socketIo from 'socket.io-client';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Event } from '../models/events.model';

const SERVER_URL = 'http://localhost:8080';

@Injectable()
export class SocketService {
    private socket;

    public tempo: number;

    public initSocket(): void {
        this.socket = socketIo(SERVER_URL);
    }

    public send(message: any): void {
        this.socket.emit('new_osc', message);
    }

    public emit(evt: string, message: any): void {
        this.socket.emit(evt, message);
    }
    
    public onMessage(): Observable<any> {
        return new Observable<any>(observer => {
            this.socket.on('message', (data: any) => observer.next(data));
        });
    }

    public onEvent(event: Event): Observable<any> {
        return new Observable<Event>(observer => {
            this.socket.on(event, (data) => observer.next(data));
        });
    }
}