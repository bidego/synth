import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppComponent } from './app.component';
import { SoundService } from './services/sound.service';
import { OscComponent } from './synth/osc.component';

@NgModule({
  declarations: [
    AppComponent,
    OscComponent
  ],
  imports: [
    BrowserModule
  ],
  providers: [
    SoundService,
    AudioContext
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
