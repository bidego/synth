import { Directive, HostListener } from '@angular/core';

@Directive({selector: 'div[handlekeys]'})
export class ListenKeys {
  numberOfKeys = 0;

  @HostListener('window:keyup', ['$event'])
  eventKeys(evt) {
    console.log(evt);
    console.log('div', evt.target, 'number of clicks:', this.numberOfKeys++);
  }
}
