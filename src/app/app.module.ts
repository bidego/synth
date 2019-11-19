import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppComponent } from './app.component';
import { SoundService } from './services/sound.service';
import { ComponentFactory } from './services/component.factory';
import { OscComponent } from './synth/osc.component';
import { ListenKeys } from './directives/listen.keys';
import { SocketService } from './services/socket.service';

@NgModule({
  declarations: [
    AppComponent,
    OscComponent,
    ListenKeys
  ],
  imports: [
    BrowserModule
  ],
  providers: [
    ListenKeys,
    SoundService,
    AudioContext,
    ComponentFactory,
    SocketService
  ],
  bootstrap: [AppComponent],
  entryComponents: [OscComponent]
})
export class AppModule { }
