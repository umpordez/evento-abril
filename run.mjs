import fs from 'node:fs';
import dotenv from 'dotenv';

dotenv.config();

const configByEnv = {
    sandbox: { baseUrl: 'https://sandbox.asaas.com/api/v3' },
    prod: { baseUrl: 'https://api.asaas.com/v3' }
};

class AsaasClient {
    constructor(token, env) {
        this.env = env;
        this.accessToken = token;

        this.config = configByEnv[env];

        this.lastRequests = [];
        this.lastResponses = [];
    }

    async doRequest(method, url, body) {
        const headers = {
            'Content-Type': 'application/json',
            'access_token': this.accessToken
        };

        url = `${this.config.baseUrl}${url}`;
        const options = {
            method: method.toUpperCase(),
            headers,
            url,
            data: body ? JSON.stringify(body) : undefined
        };

        this.lastRequest = { ...options, data: body };
        this.lastRequests.push(this.lastRequest);

        let response;
        const { stack } = new Error();

        try {
            const res = await fetch(url, {
                method: method.toUpperCase(),
                headers,
                body: options.data
            });

            const data = await res.json();

            if (data?.errors) {
                const errorMessage = data.errors.reduce((acc, curr) => {
                    return acc.concat(`${curr.code}: ${curr.description}`);
                }, []).join(', ');

                throw new Error(errorMessage);
            }

            this.lastResponse = { body: data, headers: res.headers };
            this.lastResponses.push(this.lastResponse);

            response = data;
        } catch (ex) {
            let body;
            if (ex.body) {
                try {
                    const json = (await ex.json());

                    ex.message = json.message || json.msg || ex.message;
                    body = json;
                } catch (err) {
                    console.error(err);
                }
            }

            this.lastResponse = {
                body: body,
                headers: ex.headers
            };
            this.lastResponses.push(this.lastResponse);

            ex.stack = `${ex.stack.split('\n')[0]}\n${stack}`;
            throw ex;
        }

        return response;
    }
}

const client = new AsaasClient(
    process.env.ASAAS_TOKEN,
    process.env.ASAAS_ENV
);

const res = await client.doRequest('GET', '/finance/balance');
let totalBalance = res.balance - 10; // leave R$ 10 for me :D

const files = await fs.promises.readdir('./pix-keys');

const transfers = (await fs.promises.readFile('./transfers'))
    .toString()
    .split('\n');

console.log(`Available balance (initial) R$ ${totalBalance}`);
console.log('');

async function doTransf() {
    let totalPeopleToTransf = files.length;
    for (const file of files) {
        if (transfers.includes(file)) {
            console.log(`Skip: ${file}...`);
            totalPeopleToTransf--;
            continue;
        }

        const maxForEach = Number((totalBalance / totalPeopleToTransf).toFixed(2));

        console.log(`Total balance: R$ ${totalBalance}`);
        console.log(`Max for each: R$ ${maxForEach}`);

        const valueToTransf = Number((Math.random() * maxForEach).toFixed(2));
        totalBalance -= valueToTransf;

        transfers.push(file);
        await fs.promises.writeFile('./transfers', transfers.join('\n'));

        console.log(`Transf: R$ ${valueToTransf} to ${file}...`);

        const json = JSON.parse((await fs
            .promises
            .readFile(`./pix-keys/${file}`)
        ).toString());

        const res = await client.doRequest(
            'POST',
            '/transfers',
            { value: 1, ...json }
        );

        console.log(`Transf: ${res.id} - ${res.status}`);
        totalPeopleToTransf--;

        console.log('');
        console.log('---');
        console.log('');

    }
}

// await doTransf();
