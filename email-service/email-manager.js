import { Kafka } from 'kafkajs';

async function sendEmail(to, subject, body) {
  console.log(`Sending email to ${to}: ${subject}\n${body}`);
}

const kafka = new Kafka({
  clientId: 'email-processor',
  brokers: [process.env.KAFKA_BROKER || 'redpanda:9092'],
});

const consumer = kafka.consumer({ groupId: 'email-service-group' });

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
              `Hi,\n\nYour password has just been changed. If this wasn't you, please reset your password immediately and contact support.\n\nThanks,\nSupport Team`
            );
            break;
          }

          case 'OFFER_CREATED': {
            const { offerId, gameId, amount, offeror, offeree } = data;

            if (offeror?.email) {
              await sendEmail(
                offeror.email,
                'You created an offer',
                `Hi,\n\nYour offer (${offerId}) for game ${gameId} in the amount of ${amount} has been created.\n\nThanks,\nMarketplace`
              );
            }

            if (offeree?.email) {
              await sendEmail(
                offeree.email,
                'New offer on your game',
                `Hi,\n\nYou received a new offer (${offerId}) on your game ${gameId} for ${amount}.\n\nThanks,\nMarketplace`
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
                `Hi,\n\nYour offer (${offerId}) for game ${gameId} in the amount of ${amount} was accepted.\n\nThanks,\nMarketplace`
              );
            }

            if (offeree?.email) {
              await sendEmail(
                offeree.email,
                'You accepted an offer',
                `Hi,\n\nYou accepted offer (${offerId}) on your game ${gameId} for ${amount}.\n\nThanks,\nMarketplace`
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
                `Hi,\n\nYour offer (${offerId}) for game ${gameId} in the amount of ${amount} was rejected.\n\nThanks,\nMarketplace`
              );
            }

            if (offeree?.email) {
              await sendEmail(
                offeree.email,
                'You rejected an offer',
                `Hi,\n\nYou rejected offer (${offerId}) on your game ${gameId} for ${amount}.\n\nThanks,\nMarketplace`
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
