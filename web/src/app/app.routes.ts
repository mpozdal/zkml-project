import { Routes } from '@angular/router';
import { AboutProjectComponent } from './components/about-project/about-project.component';
import { CreditApplicationComponent } from './components/credit-application/credit-application.component';

export const routes: Routes = [
  {
    path: '',
    component: CreditApplicationComponent,
  },
  {
    path: 'about',
    component: AboutProjectComponent,
  },
];
