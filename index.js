const { MongoClient, ServerApiVersion } = require('mongodb');
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;


// Middleware...
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ry8sapj.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();
        const doctorsTimes = client.db("doctors_time").collection("times");
        const bookingTimes = client.db("doctors_time").collection("bookings");

        app.get('/times', async (req, res) => {
            const query = {};
            const cursor = doctorsTimes.find(query);
            const result = await cursor.toArray();
            res.send(result);
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

        // LOAD / GET data ...
        app.get('/booking', async (req, res) => {
            const patient = req.query.patient;
            // console.log(patient);
            const query = { patient: patient };
            const bookings = await bookingTimes.find(query).toArray();
            res.send(bookings);
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