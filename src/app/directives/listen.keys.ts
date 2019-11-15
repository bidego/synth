import { Directive, HostListener } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { SoundService } from '../services/sound.service';

@Directive({selector: 'div[handlekeys]'})
export class ListenKeys {
  private numberOfKeys:number = 0;
  constructor(private soundService: SoundService) {
  }

  @HostListener('window:keyup', ['$event'])
  eventKeys(evt) {
    this.numberOfKeys++;
    this.soundService.emiteEventKey(evt);
  }
    
}
