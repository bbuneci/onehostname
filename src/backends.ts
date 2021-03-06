declare var fly: any
/**
 * 
 * Creates a Heroku application backend.
 * @param {string} appName The Heroku application name 
 */
export const heroku = function (appName: string) {
  return function herokuFetch(req: Request, basePath: string) {
    const herokuHost = `${appName}.herokuapp.com`
    const headers = {
      'host': herokuHost,
      'x-forwarded-host': req.headers.get("hostname")
    }
    return proxy(req, `https://${herokuHost}`, { headers, basePath })
  }
}

/**
 * Creates a surge.sh backend
 * @param {string} subdomain The <subdomain>.surge.sh for the surge.sh site
 */
export const surge = function (subdomain: string) {
  return function surgeFetch(req: Request, basePath: string) {
    const surgeHost = `${subdomain}.surge.sh`
    const headers = {
      'host': surgeHost,
      'x-forwarded-host': false
    }
    return proxy(req, `https://${surgeHost}`, { headers, basePath })
  }
}

/**
 * Creates a generic proxy backend
 * @param {string} origin The origin server to use (should be an ip, or resolve to a different IP)
 * @param {Object} [headers] Headers to pass to the origin server
 */
export const generic = function (origin: string, headers: Headers) {
  return function genericFetch(req: Request, basePath: string) {
    return proxy(req, origin, { basePath, headers })
  }
}

/**
 * Creates a backend to proxy published Github Pages sites. Auto detects sites with cnames specified.
 * @param {string} repository The <organization>/<repository> to request.
 */
export const githubPages = function (repository: string) {
  // we're doing more with the response than the others, making this async
  // let's us use `await`
  return async function githubPagesFetch(req: Request, basePath: string) {
    const [org, repo] = repository.split("/")
    const ghHost = `${org}.github.io`
    const headers = {
      host: ghHost
    }
    let path = '/' // cnames use /, non cnames use /<repo>/
    let hostname = await fly.cache.getString(`github:${repository}`) // check for cname
    let resp = null
    if (!hostname) {
      // no cname, use <org>.github.io/<repo>
      path = `/${repo}/`
      resp = await proxy(req, `https://${ghHost}${path}`, { basePath, headers })
      let location = resp.headers.get('location')
      if (location) {
        //github is redirecting us, which means this has a cname
        resp = null // this response isn't what we want
        const url = new URL(location)
        hostname = url.hostname

        // cache it for other requests
        if (hostname) await fly.cache.set(`github:${repository}`, hostname, 300)
      } else {
        return resp
      }
    }
    // if we got here, need to fetch with a hostname
    headers.host = hostname
    return await proxy(req, `https://${ghHost}`, { basePath, headers })
  }
}


/**
 * 
 * Creates a UnMarkDocs application backend.
 * @param {string} appName The UnMarkDocs application name 
 */
export const unmarkdocs = function (appName: string) {
  return function unmarkdocsFetch(req: Request, basePath: string) {
    const unmarkdocsHost = `${appName}.unmarkdocs.co`
    const headers = {
      'host': unmarkdocsHost,
      'x-forwarded-host': req.headers.get("hostname")
    }
    return proxy(req, `https://${unmarkdocsHost}`, { headers, basePath })
  }
}

const backends = {
  generic,
  githubPages,
  heroku,
  surge,
  unmarkdocs
}
export default backends

function proxy(req: Request, origin: string | URL, opts?: any) {
  const url = new URL(req.url)
  let breq: any = null

  if (req instanceof Request) {
    breq = req.clone()
  } else {
    breq = new Request(req)
  }

  if (typeof origin === "string") {
    origin = new URL(origin)
  }

  url.hostname = origin.hostname
  url.protocol = origin.protocol
  url.port = origin.port

  if (opts.basePath && typeof opts.basePath === 'string') {
    // remove basePath so we can serve `onehosthame.com/dir/` from `origin.com/`
    url.pathname = url.pathname.substring(opts.basePath.length)
  }
  if (origin.pathname && origin.pathname.length > 0) {
    url.pathname = origin.pathname + url.pathname
  }
  if (url.pathname.startsWith("//")) {
    url.pathname = url.pathname.substring(1)
  }

  breq.url = url.toString()
  //breq.headers.set("x-forwarded-for", req.remoteAddr)
  //oreq.headers.set("x-forwarded-proto", req..substring(0, req.protocol.length - 1)) // because http: isn't right
  breq.headers.set("x-forwarded-host", url.hostname)

  if (opts.headers && opts.headers instanceof Object) {
    for (const h of Object.getOwnPropertyNames(opts.headers)) {
      const v = opts.headers[h]
      if (v === false) {
        breq.headers.delete(h)
      } else if (v) {
        breq.headers.set(h, v)
      }
    }
  }

  return fetch(breq)
}
