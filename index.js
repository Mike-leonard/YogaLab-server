const express = require('express')
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors');
require('dotenv').config()
const jwt = require('jsonwebtoken');


const app = express()
const port = process.env.PORT || 3000


// middleware
app.use(cors())
app.use(express.json())

// middleware for verifying JWT
const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization
    if(!authorization) {
        return res.status(401).send({ error: true, message: 'Invalid authorization' })
    }

    const token = authorization.split(' ')[1]
    // verification jwt
    jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'Invalid authorization' })
        }
        req.decoded = decoded
        next()
    })
}


// Initial Status
app.get('/', (req, res) => {
    res.send('YogaLab Server')
})



const uri = process.env.URI

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 10,
});

async function run() {
    try {
        
        //await client.connect();
        client.connect(err => {
            if (err) {
                console.error(err)
                return
            }
        });


        // Making users collection
        const usersCollection = client.db("YogaLabDB").collection("users")

        // initial JsonwebToken Route
        app.post('/jwt', (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
            res.send({ token })
        })

        // This api need for admin to check users and their rule
        app.get('/users', verifyJWT, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        })

        // when first time user creates or already existing users available check and adding to users collection
        app.post('/users', async (req, res) => {
            const user = req.body
            const query = {email: user.email}
            const existingUser = await usersCollection.findOne(query)
            if(existingUser) {
                return res.send({message: "User already exists"})
            }
            const result = await usersCollection.insertOne(user)
            res.send(result)
        })

        // Protecting every route for every user types like admin, instructor, student
        app.get('/users/:email', verifyJWT, async (req, res) => {
            const email = req.params.email

            if(req.decoded.email !== email) {
                return res.send({role: ''})
            }

            const query = {email: email}

            const user = await usersCollection.findOne(query)
            const result = {role: user?.role }
            res.send(result)
        })
        

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
      //  await client.close();
    }
}
run().catch(console.dir);



app.listen(port, () => {
    console.log(`YogaLab listening on port ${port}`)
})