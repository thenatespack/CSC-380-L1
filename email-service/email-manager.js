import { Kafka } from 'kafkajs';
import nodemailer from "nodemailer";


const kafka = new Kafka({
  clientId: 'email-processor',
  brokers: [process.env.KAFKA_BROKER || 'redpanda:9092'],
});

const consumer = kafka.consumer({ groupId: 'email-service-group' });

const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: {
        user: 'arvid.schneider@ethereal.email',
        pass: 'bA7r2PaSRcPfYd8pda'
    }
});

async function sendEmail(toEmail, E_subject, body) {
  try {
    console.log(`Sending email to ${toEmail}: ${E_subject}`);

    const info = await transporter.sendMail({
      from: "noreply@game-exchange.com",
      to: toEmail,
      subject: E_subject,
      text: body,
    });

    console.log("Email sent:", info.messageId);
  } catch (err) {
    console.error("Failed to send email", err);
    throw err; 
  }
}

async function start() {
  await consumer.connect();
  await consumer.subscribe({ topic: 'email-notifications' });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      if (!message.value) {
        console.warn('Received message with empty value');
        return;
      }

      let payload;
      try {
        payload = JSON.parse(message.value.toString());
      } catch (err) {
        console.error('Failed to parse message as JSON', err, {
          raw: message.value.toString(),
        });
        return;
      }

      const { eventType, data } = payload;
      if (!eventType || !data) {
        console.error('Message missing eventType or data', payload);
        return;
      }

      try {
        switch (eventType) {
          case 'PASSWORD_CHANGED': {
            const { email } = data;
            if (!email) break;

            await sendEmail(
              email,
              'Your password was changed',
              `Hi,\nYour password has just been changed. If this wasn't you, please reset your password immediately and contact support.\nThanks,\nSupport Team`
            );
            break;
          }

          case 'OFFER_CREATED': {
            const { offerId, gameId, amount, offeror, offeree } = data;

            if (offeror?.email) {
              await sendEmail(
                offeror.email,
                'You created an offer',
                `Hi,\nYour offer (${offerId}) for game ${gameId} in the amount of ${amount} has been created.\nThanks,\nMarketplace`
              );
            }

            if (offeree?.email) {
              await sendEmail(
                offeree.email,
                'New offer on your game',
                `Hi,\nYou received a new offer (${offerId}) on your game ${gameId} for ${amount}.\nThanks,\nMarketplace`
              );
            }
            break;
          }

          case 'OFFER_ACCEPTED': {
            const { offerId, gameId, amount, offeror, offeree } = data;

            if (offeror?.email) {
              await sendEmail(
                offeror.email,
                'Your offer was accepted',
                `Hi,\nYour offer (${offerId}) for game ${gameId} in the amount of ${amount} was accepted.\nThanks,\nMarketplace`
              );
            }

            if (offeree?.email) {
              await sendEmail(
                offeree.email,
                'You accepted an offer',
                `Hi,\nYou accepted offer (${offerId}) on your game ${gameId} for ${amount}.\nThanks,\nMarketplace`
              );
            }
            break;
          }

          case 'OFFER_REJECTED': {
            const { offerId, gameId, amount, offeror, offeree } = data;

            if (offeror?.email) {
              await sendEmail(
                offeror.email,
                'Your offer was rejected',
                `Hi,\nYour offer (${offerId}) for game ${gameId} in the amount of ${amount} was rejected.\nThanks,\nMarketplace`
              );
            }

            if (offeree?.email) {
              await sendEmail(
                offeree.email,
                'You rejected an offer',
                `Hi, \n You rejected offer (${offerId}) on your game ${gameId} for ${amount}.\nThanks,\nMarketplace`
              );
            }
            break;
          }

          default:
            console.warn('Unknown eventType', eventType, payload);
        }
      } catch (err) {
        console.error('Error handling email notification', err, { eventType, data });
      }
    },
  });
}

start().catch((err) => {
  console.error('Email consumer failed to start', err);
  process.exit(1);
});
