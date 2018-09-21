import Koa, { Context, Request } from 'koa'
import bodyParser from 'koa-bodyparser'
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
 * Greetings
 *
 * There is a lack of people people greeters on the web. This is why we built
 * **hGreet** - our very own greeter api!
 *
 * @route /
 */
const router = new Router()


interface Ryan {
    correct: string;
}
/**
 * Ryan
 *
 * hi ryan
 *
 * @body {Ryan} {application/json}
 */
router.get('/correct', ctx => {

})

interface David {
    /** I mispelled this field */
    soemthing: 'hi';
    // hello: string;
    /** hello */
    [davidstuff: string]: string;
}
// example[davidstuff] : example[example[davidstuff]]

/**
 * David
 *
 * hi david
 *
 * @body {David} {application/json}
 */
router.get('/david', ctx => {

})

/**
 * Say hello
 *
 * Give a nice, welcoming, greeting message.
 *
 * @response {text/plain} 200
 *  Hello world!
 */
router.get('/', async ctx => {
    ctx.body = 'Hello world!'
})

/**
 * Set hello message
 *
 * This does nothing.
 *
 * @response {text/plain} 200
 *  Hello world!
 */
router.post('/', async ctx => {
    ctx.body = 'Hello world!'
})

/**
 * Greet a human
 *
 * Say hello to a person with a given name.
 *
 * @param {string} name The name of the person
 *
 * @response {text/plain} 200 name is valid
 *  Hello human!
 * @response 400 name has numbers
 */
router.get('/greet/:name', async ctx => {
    if (/[0-9]/.test(ctx.params.name)) ctx.throw(400)
    ctx.body = `Hello ${ctx.params.name}!`
})

interface ParsedName {
    firstname: string
    lastname: string
}

/**
 * Parse a name
 *
 * Parses a name given in the format "FN LN" (where FN = first name and LN =
 * last name) into JSON format
 *
 * @query {string} name The name of the person
 *
 * @response {ParsedName} 200 name has only one space
 * @response {text/plain} 400 name is not specified
 *  Name query parameter not specified
 * @response {text/plain} 400 name does not have exactly one space
 *  Your name is too complicated for my simple algorithms
 */
router.get('/parse', async (ctx: TypedCtx<ParsedName>) => {
    if (!ctx.query.name) ctx.throw(400, 'Name query parameter not specified')
    const splitName = ctx.query.name.split(' ')
    if (splitName.length != 2) ctx.throw(400, 'Your name is too complicated for my simple algorithms')
    ctx.body = {
        firstname: splitName[0],
        lastname: splitName[1]
    } as ParsedName
})

/**
 * @response uh oh
 */
router.get('/incorrect', async ctx => {
    ctx.throw(500)
})

interface ComplicatedResponse {
    property: {
        nonsensical: boolean,
        anobject: {
            name: string,
            something: boolean,
            else: number,
        }[]
    }
}

/**
 * Give a nonsensical response
 *
 * Sends a weird body back.
 *
 * @response {ComplicatedResponse} 200
 */
router.get('/random', async (ctx: TypedCtx<ComplicatedResponse>) => {
    ctx.body = {
        property: {
            nonsensical: true,
            anobject: [{
                    name: "dog",
                    something: true,
                    else: 4
                }, {
                    name: "rattlesnake",
                    something: false,
                    else: 9
            }]
        }
    }
})

interface ExampleBody {
    hello: string,
    something: number
}

/**
 * Take in some data
 *
 * @body {ExampleBody} {application/json}
 *
 * @response 500
 *  No body
 * @response {text/text} 200
 *  The hello field of the data I sent
 */
router.post('/post', bodyParser(), async (ctx: BodiedCtx<ExampleBody>) => {
    if (!ctx.request.body) throw ctx.throw(500, 'No body')
    ctx.body = ctx.request.body.hello
})

app.use(router.routes())
app.use(router.allowedMethods())
app.listen(8080)
