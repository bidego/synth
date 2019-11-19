import { Component, ViewChild, ElementRef, Inject, ViewContainerRef } from '@angular/core';
import { ComponentFactory } from './services/component.factory';
import { OscComponent } from './synth/osc.component';
import { SocketService } from './services/socket.service';
import { Action } from './models/actions.model';
import { Event } from './models/events.model';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'syntotec-app';
  
  action = Action;
  user: any;
  messages: any[] = [];
  messageContent: string;
  ioConnection: any;

  @ViewChild("container", { static:false })
  private container:ElementRef;
  constructor(private _factory:ComponentFactory,
    @Inject(ViewContainerRef) viewContainerRef,
    private socketService: SocketService) {
    _factory.setRootViewContainerRef(viewContainerRef);
  }

  ngOnInit(): void {
    this.initIoConnection();
  }

  private initIoConnection(): void {
    this.socketService.initSocket();

    this.ioConnection = this.socketService.onMessage()
      .subscribe((message: any) => {
        this.messages.push(message);
      });

    this.socketService.onEvent(Event.CONNECT)
      .subscribe(() => {
        console.log('connected');
      });
      
    this.socketService.onEvent(Event.DISCONNECT)
      .subscribe(() => {
        console.log('disconnected');
      });
  }

  public sendMessage(message: string): void {
    if (!message) {
      return;
    }

    this.socketService.send({
      from: this.user,
      content: message
    });
    this.messageContent = null;
  }

  public sendNotification(params: any, action: Action): void {
    let message: any;

    if (action === Action.JOINED) {
      message = {
        from: this.user,
        action: action
      }
    } else if (action === Action.RENAME) {
      message = {
        action: action,
        content: {
          username: this.user.name,
          previousUsername: params.previousUsername
        }
      };
    }

    this.socketService.send(message);
  }

  addOscilator() {
    this._factory.addDynamicComponent();
  }

  get oscsCount(): number {
    return OscComponent.getCount();
  } 
}
