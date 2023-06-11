const express = require('express')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
require('dotenv').config()
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

const app = express()
const port = process.env.PORT || 3000


// middleware
app.use(cors())
app.use(express.json())

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://yoga-lab-16ef6.firebaseapp.com',
});



// middleware for verifying JWT
const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization
    if (!authorization) {
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
        //  Making Class collection
        const classCollection = client.db("YogaLabDB").collection("classes")
        // student carts collection
        const cartCollection = client.db("YogaLabDB").collection("carts")

        // initial JsonwebToken Route
        app.post('/jwt', (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
            res.send({ token })
        })

        // middleware
        // call verify jwt first and then call it.
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'forbidden access!' })
            }
            next()
        }

        //adding to instructor path
        // await Promise makes call faster
        app.get('/users/instructor', async (req, res) => {
            const query = { role: "instructor" };
            const instructors = await usersCollection.find(query).toArray();
            const instructorsWithUserInfo = [];

            await Promise.all(
                instructors.map(async (instructor) => {
                    try {
                        const userRecords = await admin.auth().getUserByEmail(instructor.email);
                        const { photoURL } = userRecords;
                        instructorsWithUserInfo.push({
                            _id: instructor._id,
                            name: instructor?.name,
                            email: instructor?.email,
                            photoURL,
                            role: instructor?.role,
                        });
                    } catch (error) {
                        console.error(`Error retrieving user record for ${instructor.email}:`, error);
                    }
                })
            );

            res.send(instructorsWithUserInfo);

        });



        // This api need for admin to check users and their rule
        app.get('/users', async (req, res) => {
            const result = await usersCollection.find().toArray()
            //console.log(result)
            res.send(result);

        })

        // Creating users time
        // when first time user creates or already existing users available check and adding to users collection
        app.post('/users', async (req, res) => {
            const user = req.body
            const query = { email: user.email }
            const existingUser = await usersCollection.findOne(query)
            if (existingUser) {
                return res.send({ message: "User already exists" })
            }
            const result = await usersCollection.insertOne(user)
            res.send(result)
        })

        // student specific call cart to get Item show on my selected course
        app.get('/carts', verifyJWT, async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([]);
                return
            }
            const decodedEmail = req.decoded.email
            if (email !== decodedEmail) {
                return res.status(403).send({ error: true, message: 'Forbidden Access!' });
            }
            const query = { email: email }
            const result = await cartCollection.find(query).toArray()
            res.send(result)
        });

        // TODO: test later with jwt
        // while posting items to cart
        app.post('/carts', async (req, res) => {
            const item = req.body
            const result = await cartCollection.insertOne(item)
            res.send(result)
        })

        // TODO: test later with jwt
        // deleting student cart item 
        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await cartCollection.deleteOne(query);
            res.send(result);
        })

        // DASHBOARD
        // Protecting every route for every user types like admin, instructor, student
        app.get('/users/:email', async (req, res) => {
            const email = req.params.email

           /*  if (req.decoded.email !== email) {
                return res.send({ role: '' })
            } */

            const query = { email: email }

            const user = await usersCollection.findOne(query)
            const result = { role: user?.role }
            res.send(result)
        })

        // DASHBOARD
        // setting up user rule when user is admin
        app.patch('/users/admin/:id', verifyJWT, verifyAdmin, async (req, res) => {
            // lets query first
            let query = req.query?.type
            const id = req.params.id
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    role: query,
                }
            };

            const result = await usersCollection.updateOne(filter, updatedDoc)
            res.send(result)
        })

        // with query calling it from classes route frontend
        // DASHBOARD
        // Admin specific to show on manage classes
        app.get('/classes', async (req, res) => {
            const status = req.query?.status
            const query = {status: status}
            const result = await classCollection.find(query).toArray()
            res.send(result);
        })

        // DASHBOARD
        // instructor posting a new class though this route
        app.post('/classes', verifyJWT, async (req, res) => {
            const addNewClass = req.body
            const result = await classCollection.insertOne(addNewClass)
            res.send(result)
        })

        // DASHBOARD
        // finding single instructor classes
        app.get('/classes/:email', verifyJWT, async (req, res) => {
            const email = req.params.email

            if (req.decoded.email !== email) {
                return res.send({ classes: [] })
            }

            const query = { instructor_email: email }

            const instructorClasses = await classCollection.find(query).toArray()
            const result = { classes: instructorClasses }
            res.send(result)
        })

        // DASHBOARD
        // admin status changing steps to deny or approved or feedback
        app.patch('/classes/:id', verifyJWT, verifyAdmin, async (req, res) => {
            // lets query first
            const { statusType, feedback } = req.query
            const id = req.params.id
            console.log(statusType, feedback)
            const filter = { _id: new ObjectId(id) }

            const updatedDoc = {
                $set: {
                    status: statusType,
                    feedback: feedback,
                }
            };

            const result = await classCollection.updateOne(filter, updatedDoc)
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