import {Pipe, PipeTransform} from '@angular/core';

@Pipe({
  name: 'marketCap'
})
export class MacroNumberPipe implements PipeTransform {


  transform(value: number, digits?: number): any {

    const THOUSAND = 1000;
    const MILLION = 1000000;
    const BILLION = 1000000000;
    const TRILLION = 1000000000000;

    const numberValue: number = value < THOUSAND ? value :
      value < MILLION ? value / THOUSAND :
        value < BILLION ? value / MILLION :
          value < TRILLION ? value / BILLION :
            value / TRILLION;

    const qualifier: string = value < MILLION ? 'K' : value < BILLION ? 'M' : value < TRILLION ? 'B' : 'T';

    return numberValue.toFixed(digits ? digits : 2) + qualifier;
  }
}
