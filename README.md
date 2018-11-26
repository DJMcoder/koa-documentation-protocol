# documentation-protocol
Parses comments on koa controllers to produce documentation.
This requires Koa and TypeScript. File placement does not matter.

```
npm install harkerdev-documentation-protocol -g
```

## Documentation Protocol
The documentation protocol as so, per each controller.
```typescript
import Koa, { Context } from 'koa'
import Router from 'koa-router'

const app = new Koa()

// typed response
interface TypedCtx<T> extends Context {
    body: T
}

// typed POST body
interface BodiedRequest<T> extends Request {
    body: T|null
}
interface BodiedCtx<T> extends Context {
    request: BodiedRequest<T>
}

/**
 * Router title
 *
 * Router description
 * **bold** - we support markdown
 *
 * @route /path/
 */
const router = new Router()

// ...

interface ComplicatedResponse {
    // ...
}

/**
 * Route title
 *
 * Route description
 *
 * @query {type} queryParam description
 * @param {string} urlParam description
 *
 * @response {ComplicatedResponse} 200 condition
 * @response {text/plain} 400 condition
 *  Text based response
 *
 * @body {BodyType} {application/json}
 */
router.get('/path/:urlParam', async (ctx: TypedCtx<ComplicatedResponse|string>) => {
    const urlParam: string = ctx.request.params.urlParam;
    let res: ComplicatedResponse;
    // ...
    if (err) {
        ctx.status = 400;
        ctx.body = 'There was an error';
    }
    else {
        // by default, ctx.status = 200
        ctx.body = res;
    }
})
```

## Config
In the same directory that the `tsconfig.json` is in, create a config file called `docconfig.json`.

### Example

```json
{
    "output": "./api.apib",
    "host": "greeter.harkerdev.com",
    "title": "hGreet API",
    "description": "Top-level description of the API! Yay!",
    "defaults": {
        "string": "abcd",
        "number": 1234,
        "boolean": true,
        "jsonKey": "key"
    },
    "examples": {
        "response": {
            "firstname": "John",
            "lastname": "Doe"
        },
        "param": {
            "firstname": "John",
            "lastname": "Doe"
        },
        "all": {
            "firstname": "John",
            "lastname": "Doe"
        }
    },
    "afterHook": "aglio --theme-variables flatly --theme-template triple -i ./api.apib -o ./api.html"
}
```

### Description

Property | Type | Description
|-|-|-|
`output` | `string` | The file to output the API Blueprint file to
`host` | `string` | The domain to which the documentation refers
`title` | `string` | The title of the API
`description` | `string` | The description of the purpose of the API
`defaults` | `object` | The default examples to give for parameters and responses
`defaults.string` | `string` | The default string example
`defaults.number` | `number` | The default number example
`defaults.boolean` | `boolean` | The default boolean example
`defaults.jsonKey` | `string` | The default example key
`examples` | `object` | The specific examples to give for parameters and responses
`examples.response` | `object` | The specific examples to give for responses. For each
`examples.params` | `object` | The specific examples to give for parameters
`examples.all` | `object` | The specific examples to give for parameters and responses
`afterHook` | `string` | The command to run after producing the API blueprint

When creating an example query and URL parameter examples, the compiler will use the examples given by `examples.all` and `examples.param` as values for each parameter. If not given, the compiler will use the value of `defaults.string`.

When creating an example response Body (in JSON), the compiler will use examples given by `examples.all` and `examples.response`, filling out the Schema given in the comment. If the examples are not defined, the default for the type.

### Running

Once installed, change the working directory to the same one as the `docconfig.json`. Run the command `hdoc`. An API Blueprint will have been produced, and then you can run something to convert that into HTML (e.g., aglio).

You can also use it with multiple options

Option | Description
|-|-|
`-h, --help` | Show help
`-p, --project` | Path to a `docconfig.json` file describing documentation
`-w, --watch` | Recompile when input files change

For example, to run with the configuration `docconfig2.json` in watch mode, you would run the command `hdoc -p docconfig2.json -w` .
