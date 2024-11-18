import { IHttpContext } from '../models';

export class ChangeIPLocationCommand {
  constructor(public readonly context: IHttpContext) {}
}
