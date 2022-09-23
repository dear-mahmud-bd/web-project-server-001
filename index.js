const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const nodemailer = require('nodemailer');
const sgTransport = require('nodemailer-sendgrid-transport');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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


// Sendign email from website ...
const emailSenderOptions = {
    auth: {
        api_key: process.env.EMAIL_SENDER_KEY
    }
}
const emailClient = nodemailer.createTransport(sgTransport(emailSenderOptions));
function sendAppointmentEmail(booking) {
    const { patient, patientName, treatment, date, slot } = booking;
    var email = {
        from: process.env.EMAIL_SENDER,
        to: patient,
        subject: `Your Appointment for '${treatment}' is Confirmed.`,
        text: `Your Appointment for ${treatment}  is Confirmed`,
        html: `
            <div style="max-width:700px">
                <h1>
                    Hello, ${patientName}
                </h1>
                <div>
                    <h3>On ${date} at ${slot}</h3>
                    <h3><b>Your Appointment for '${treatment}' is confirmed</b></h3>
                    <h4><b>Please confirm your appointment on time -Thank You</b></h4><br>
                    <p>Powered by <a href="https://mern-stack-002.web.app/" target="_blank">Doctor Portal</a></p>
                </div>
            </div>
      `
    };
    emailClient.sendMail(email, function (err, info) {
        if (err) {
            console.log(err);
        } else {
            console.log('Message sent: ', info);
        }
    });
}



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ry8sapj.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();
        const doctorsTimes = client.db("doctors_time").collection("times");
        const bookingTimes = client.db("doctors_time").collection("bookings");
        const userTimes = client.db("doctors_time").collection("user");
        const doctorCollection = client.db("doctors_time").collection("doctors");
        const paymentCollection = client.db("doctors_time").collection("payments");

        // verify admin ...
        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userTimes.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next();
            } else {
                res.status(403).send({ message: 'forbidden' });
            }
        }

        // Payment 
        app.post("/create-payment-intent", verifyJWT, async (req, res) => {
            const { price } = req.body;
            // const service = req.body;
            // const price = service.price;
            const amount = price * 100;
            // Create a PaymentIntent with the order amount and currency
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "inr",
                payment_method_types: ['card']
            });

            res.send({ clientSecret: paymentIntent.client_secret });
        });

        // Get all free times for all services ...
        app.get('/times', async (req, res) => {
            const query = {};
            // to find name using "project({ name: 1 })"...
            const cursor = doctorsTimes.find(query).project({ name: 1 });
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

        // ckeck admin or not ...
        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await userTimes.updateOne(filter, updateDoc);
            res.send(result);

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
                sendAppointmentEmail(booking);
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

        // get data with a particuler id ...
        app.get('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const booking = await bookingTimes.findOne(query);
            res.send(booking);
        })

        app.patch('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const result = await paymentCollection.insertOne(payment);
            const updatedBooking = await bookingTimes.updateOne(filter, updatedDoc);
            res.send(updatedDoc);
        })

        // adding doctors ...
        app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result);
        })

        app.get('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctors = await doctorCollection.find().toArray();
            res.send(doctors);
        })
        app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const result = await doctorCollection.deleteOne(filter);
            res.send(result);
        })

    } finally {
        // await client.close();
    }
}
run().catch(console.dir);





app.get('/', (req, res) => {
    res.send('Server : কিরে তোর খবর কি?  Me : তোরে থাব্রামু ');
});
app.listen(port, () => {
    console.log("Listening on port");
});