/**
 * Copyright Amazon.com, Inc. and its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"). You
 * may not use this file except in compliance with the License. A copy of
 * the License is located at
 *
 *     http://aws.amazon.com/apache2.0/
 *
 * or in the "license" file accompanying this file. This file is
 * distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied. See the License for the specific
 * language governing permissions and limitations under the License.
 */
import { Handler } from 'aws-lambda';
import { SESClient, SendEmailCommand, SendEmailCommandInput } from "@aws-sdk/client-ses"; // ES Modules import

const sesClient = new SESClient({});

export const handler: Handler = async (event, context) => {
    try {
        console.log("Received Event", JSON.stringify(event, null, 2));
        await constructAndSendEmailNotification({
            userEmail: event.userEmail,
            friendlyName: event.friendlyName,
            eventType: event.eventType
        })
    }
    catch (error) {
        console.error("Errored while processing the message", error)
    }
};

interface EmailNotificationParameters {
    userEmail: string,
    friendlyName: string,
    eventType: string
}

const constructAndSendEmailNotification = async (emailNotificationParams: EmailNotificationParameters) => {

    if (emailNotificationParams.eventType === 'DEVICE_REMOVED') {
        console.debug("A device has been removed - Sending email to the client")
        const messageToSend = `Authenticator ( ${emailNotificationParams.friendlyName} ) has been removed form the list`

        await sendEmail({
            Destination: { ToAddresses: [emailNotificationParams.userEmail] },
            Message: {
                Body: {
                    Text: {
                        Data: messageToSend,
                    },
                },
                Subject: {
                    Data: "An Authenticator Removed",
                },
            },
            Source: process.env.SES_FROM_ADDRESS,
        })
    }

    if (emailNotificationParams.eventType === 'DEVICE_REGISTERED') {
        console.debug("A device has been added to the list - Sending email to the client")
        const messageToSend = `A new authenticator  ( ${emailNotificationParams.friendlyName} ) has been added to the authenticators list`
        await sendEmail({
            Destination: { ToAddresses: [emailNotificationParams.userEmail] },
            Message: {
                Body: {
                    Text: {
                        Data: messageToSend,
                    },
                },
                Subject: {
                    Data: "New Authenticator Added",
                },
            },
            Source: process.env.SES_FROM_ADDRESS,
        })
    }
}


const sendEmail = async (emailCommand: SendEmailCommandInput) => {
    try {
        await sesClient.send(new SendEmailCommand(emailCommand));
        console.log("Email sent successfully")
    } catch (error) {
        console.log("Errored while sending the email", error)
    }
}