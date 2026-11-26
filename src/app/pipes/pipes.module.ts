import {NgModule} from '@angular/core';
import {YesNoPipe} from './yesno.pipe';
import {MacroNumberPipe} from './macro-number.pipe';
import {PercentPipe} from './percent.pipe';

@NgModule({
  exports: [
    YesNoPipe,
    MacroNumberPipe,
    PercentPipe,
  ],
  declarations: [
    YesNoPipe,
    MacroNumberPipe,
    PercentPipe
  ]
})

export class PipesModule {
}
