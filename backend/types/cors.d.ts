declare module 'cors' {
  import { RequestHandler } from 'express'
  interface CorsOptions {
    origin?: string | boolean | RegExp | (string | RegExp)[]
  }
  function cors(options?: CorsOptions): RequestHandler
  export = cors
}


