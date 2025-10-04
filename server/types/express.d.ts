// Extend Express Request interface to include custom properties
declare namespace Express {
  interface Request {
    subdomain?: string;
    company?: any;
    facility?: any;
    isHeadquarters?: boolean;
  }
}
