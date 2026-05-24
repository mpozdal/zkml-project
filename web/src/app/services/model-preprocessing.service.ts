import { Injectable } from '@angular/core';
import { CreditFormValues, ModelConfig } from '../models/model-config';
import { formValuesToRawFeatures, toCircuitInputStrings } from '../utils/credit-preprocessing';

@Injectable({ providedIn: 'root' })
export class ModelPreprocessingService {
  private configPromise?: Promise<ModelConfig>;

  getConfig(): Promise<ModelConfig> {
    if (!this.configPromise) {
      this.configPromise = fetch('/model_config.json').then(async (response) => {
        if (!response.ok) {
          throw new Error('Failed to load model_config.json');
        }

        return response.json() as Promise<ModelConfig>;
      });
    }

    return this.configPromise;
  }

  async prepareCircuitInputs(formValues: CreditFormValues): Promise<string[]> {
    const config = await this.getConfig();
    const rawFeatures = formValuesToRawFeatures(formValues, config);
    return toCircuitInputStrings(rawFeatures, config);
  }
}
