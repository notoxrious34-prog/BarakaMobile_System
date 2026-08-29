import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'BarakaMobile API',
      timestamp: new Date().toISOString(),
    };
  }
}
