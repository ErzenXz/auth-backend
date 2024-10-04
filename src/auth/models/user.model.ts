import { Role } from '../enums';

export type User = {
  id: string;
  email: string;
  password: string;
  name: string;
  role: Role;
};
