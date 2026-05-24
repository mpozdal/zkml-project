import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SiteHeaderComponent } from '../site-header/site-header.component';

@Component({
  selector: 'app-about-project',
  templateUrl: './about-project.component.html',
  styleUrl: './about-project.component.css',
  imports: [RouterLink, SiteHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutProjectComponent {}
