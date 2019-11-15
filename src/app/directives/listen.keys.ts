import { Directive, HostListener } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { SoundService } from '../services/sound.service';

@Directive({selector: 'div[handlekeys]'})
export class ListenKeys {
  private numberOfKeys:number = 0;
  constructor(private soundService: SoundService) {
  }

  @HostListener('window:keydown', ['$event'])
  eventKeyDown(evt) {
    this.numberOfKeys++;
    this.soundService.emiteEventKey(evt);
  }
  @HostListener('window:keyup', ['$event'])
  eventKeysUp(evt) {
    this.numberOfKeys++;
    this.soundService.emiteEventKey(evt);
  }
    
}
