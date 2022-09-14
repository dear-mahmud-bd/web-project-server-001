const { MongoClient, ServerApiVersion } = require('mongodb');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;


// Middleware...
app.use(cors());
app.use(express.json());


function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    // console.log(authHeader)
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized Access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: 'Forbidden Access' });
        }
        req.decoded = decoded;
        next();
    })
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ry8sapj.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();
        const doctorsTimes = client.db("doctors_time").collection("times");
        const bookingTimes = client.db("doctors_time").collection("bookings");
        const userTimes = client.db("doctors_time").collection("user");

        app.get('/times', async (req, res) => {
            const query = {};
            const cursor = doctorsTimes.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });

        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userTimes.find().toArray();
            res.send(users)
        })

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userTimes.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })
        app.put('/user/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requesterAccount = await userTimes.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                const filter = { email: email };
                const updateDoc = {
                    $set: { role: 'admin' },
                };
                const result = await userTimes.updateOne(filter, updateDoc);
                res.send(result);
            } else {
                res.status(403).send({ message: 'Forbidden Access' });
            }
        });

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            const updateDoc = {
                $set: user,
            };
            const result = await userTimes.updateOne(filter, updateDoc, options);
            res.send({ result, token });
        });

        // available apointpent ( Explore more:- MongoDB Agrregation )...
        app.get('/available', async (req, res) => {
            const date = req.query.date;

            // (1) get all times ...
            const times = await doctorsTimes.find().toArray();

            // (2) get booking of that day ...
            const query = { date: date };
            const bookings = await bookingTimes.find(query).toArray();

            // (3) for each time ...
            times.forEach(service => {
                // (4) find booking for that time ...
                const timeBookings = bookings.filter(booking => booking.treatment === service.name);
                // (5) select slots for timeBookings...
                const booked = timeBookings.map(book => book.slot);
                service.booked = booked;
                // (6) select those which are not in booked slot ...
                const available = service.slots.filter(slot => !booked.includes(slot));
                service.slots = available;
            })
            res.send(times);
        });

        // Adding or Creating ...
        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient };
            const exists = await bookingTimes.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists });
            } else {
                const result = await bookingTimes.insertOne(booking);
                return res.send({ success: true, result });
            }
        })

        // GET data & a MIDDLETARE
        app.get('/booking', verifyJWT, async (req, res) => {
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email;
            if (patient === decodedEmail) {
                const query = { patient: patient };
                const bookings = await bookingTimes.find(query).toArray();
                return res.send(bookings);
            } else {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
        })

    } finally {
        // await client.close();
    }
}
run().catch(console.dir);





app.get('/', (req, res) => {
    res.send('Hello Server');
});
app.listen(port, () => {
    console.log("Listening on port");
});