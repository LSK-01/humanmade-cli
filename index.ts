import { initializeApp } from "firebase/app";
import { Timestamp, getFirestore } from "firebase/firestore";
import yargs, { describe } from "yargs";
import fs from "fs";
import * as path from "path";
import mime from "mime-types";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import inquirer from "inquirer";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { hideBin } from "yargs/helpers";

interface Commit {
	percentage: number;
	description: string;
	time: Timestamp;
	uid: string;
	creationId: string;
	evidence: { [key: string]: string };
	hashes: string[];
	blockchained: boolean;
	tags: { [key: string]: number };
	usedAI: boolean;
}

// Firebase configuration
const firebaseConfig = {
	apiKey: "AIzaSyCosbLioKvt7VCLFuoTYVxKPRXhMb54-X0",
	authDomain: "humanmade-b1f8c.firebaseapp.com",
	projectId: "humanmade-b1f8c",
	storageBucket: "humanmade-b1f8c.appspot.com",
	messagingSenderId: "645532977740",
	appId: "1:645532977740:web:f6a9f7209800ca5d4a82e9",
	measurementId: "G-SQRXRS4MNW",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
const db = getFirestore(app);
const storage = getStorage();
const backendURL = "http://127.0.0.1:5000";

const projectId = "humanmade-b1f8c";
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const creationsUrl = `${baseUrl}:runQuery`;

function bufferToHex(buffer: ArrayBuffer) {
	return Array.from(new Uint8Array(buffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

async function hashFile(file: Buffer): Promise<string> {
	try {
		const hashBuffer = await crypto.subtle.digest("SHA-256", file);
		return bufferToHex(hashBuffer);
	} catch (error) {
		console.error("Error hashing file:", error);
		return "hash failed";
	}
}

let getSim = async (tag: string, file: Buffer, creationID: string) => {
	if (tag != "") {
		let idToken;
		try {
			idToken = await fs.promises.readFile("./HumanMade/token.txt");
		} catch (error) {
			console.log("\nMake sure to authenticate first with the 'login' command");
		}
		//get image with same tag in previous commit (top commit)
		const latestCommitQuery = {
			structuredQuery: {
				from: [
					{
						collectionId: `commits`,
					},
				],
				orderBy: [
					{
						field: {
							fieldPath: "time",
						},
						direction: "DESCENDING",
					},
				],
				limit: 1,
			},
		};

		const commitUrl = `${baseUrl}/creations/${creationID}:runQuery`;

		const firebaseRes = await fetch(commitUrl, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${idToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(latestCommitQuery),
		});

		const data = await firebaseRes.json();
		const evidence = data[0]?.document?.fields?.evidence;

		console.log(
			"data: ",
			data,
			"evidence: ",
			evidence,
			"field obj:",
			evidence.mapValue.fields["mountain%2Bimage%2Fjpeg%2B1708722683111"].stringValue
		);

		if (evidence) {
			const key = Object.keys(evidence.mapValue.fields).find((key) => key.startsWith(tag));
			if (key) {
				const imageUrl = evidence.mapValue.fields[key].stringValue;
				//check if the tagged image exists, get url if so

				const imageSimRes = await fetch(backendURL + "/imageSimilarity", {
					method: "POST",
					body: JSON.stringify({ url: imageUrl, imageb64: file.toString("base64") }),
				});

				const scoreObj = await imageSimRes.json();
				return scoreObj.sim;
			}
		}
	}

	return null;
};

yargs(hideBin(process.argv))
	.command({
		command: "commit",
		describe: "Add a document to Firestore",
		builder: {
			files: {
				describe: "Filenames to commit",
				demandOption: true,
				type: "array",
			},
			tags: {
				describe: "Tags to commit, same order as files",
				demandOption: true,
				type: "array",
			},
			description: {
				describe: "Description for the commit",
				demandOption: true,
				type: "string",
			},
			usedAI: {
				describe: "Used AI or not, true or false",
				demandOption: false,
				default: false,
				type: "boolean",
			},
			percentage:{
				describe: "New percentage completion",
				demandOption: true,
				default: false,
				type: "string",
			},
			creationID: {
				describe: "Creation to commit to",
				demandOption: true,
				default: false,
				type: "string",
			},
		},
		async handler(argv: any) { 
			const { files, inputTags, description, usedAI, creationID, percentage } = argv;

			let evidence: { [key: string]: string } = {};

			let hashes: string[] = [];
			let tags: { [key: string]: string } = {};

			for (let index = 0; index < files.length; index++) {
				const filename = files[index];
				const ext = path.extname(filename);
				const mimeType = mime.lookup(ext);
				const data = await fs.promises.readFile(filename);
				const tag = inputTags[index];

				if (Object.keys(tags).includes(tag)) {
					console.log("Every tag must be unique");
					return;
				} else {
					const simScore = await getSim(tag, data, creationID);
					if (simScore) {
						tags[tag] = simScore as string;
					}
				}

				const fileName = encodeURIComponent(tags[index] + "+" + mimeType + "+" + String(Date.now()));
				const storageRef = ref(storage, `${creationID}/${fileName}`);
				const snapshot = await uploadBytes(storageRef, data);
				const downloadURL = await getDownloadURL(snapshot.ref);

				hashes.push(await hashFile(data));
				evidence[fileName] = downloadURL;
			}

			//push commit to firestore
			const pushCommitUrl = `${baseUrl}/creations/${creationID}/commits`;

			let idToken;
			let uid;
			try {
				idToken = await fs.promises.readFile("./HumanMade/token.txt");
				uid = await fs.promises.readFile("./HumanMade/uid.txt");
			} catch (error) {	
				console.log("\nMake sure to authenticate first with the 'login' command");
			}

			const commitData = {
				fields: {
					description: {stringValue: description},
					uid: {stringValue: uid?.toString()},
					percentage: {integerValue: percentage},
					time: {timestampValue: new Date().toISOString()},
					creationId: {stringValue: creationID},
					evidence: {mapValue: {fields: Object.keys(evidence).map(key => ({key: {stringValue: evidence[key]}}))}},
					hashes:{arrayValue: {values: hashes.map((hash) => ({stringValue: hash}))}},
					blockchained: {booleanValue: false},
					tags: {mapValue: {fields: Object.keys(tags).map(key => ({key: {integerValue: tags[key]}}))}},
					usedAI: {booleanValue: usedAI},
			}
		};

			const firebaseRes = await fetch(pushCommitUrl, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${idToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(commitData),
			});
		},
	})
	.parse();

yargs(hideBin(process.argv))
	.command({
		command: "creations",
		describe: "List creation IDs",
		builder: {},
		async handler(argv: any) {
			let idToken;
			let uid;
			try {
				idToken = await fs.promises.readFile("./HumanMade/token.txt");
				uid = await fs.promises.readFile("./HumanMade/uid.txt");
			} catch (error) {
				console.log("\nMake sure to authenticate first with the 'login' command");
			}

			const creationsQuery = {
				structuredQuery: {
					where: {
						fieldFilter: {
							field: { fieldPath: "uid" },
							op: "EQUAL",
							value: { stringValue: uid?.toString() },
						},
					},
					from: [
						{
							collectionId: "creations",
						},
					],
				},
			};

			const res = await fetch(creationsUrl, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${idToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(creationsQuery),
			});

			const data = await res.json();
			if (data[0]?.error) {
				console.log("\nMake sure to authenticate first with the 'login' command");
			}

			data.forEach((elem: any) => {
				const document = elem.document;
				const docName = document.name as string;
				console.log(document.fields.name.stringValue, ": ", docName.split("/").at(-1));
			});
		},
	})
	.parse();

yargs(hideBin(process.argv))
	.command({
		command: "login",
		describe: "Log in",
		builder: {
			email: {
				describe: "Email",
				demandOption: true,
				type: "string",
			},
		},
		handler: async (argv) => {
			const { email } = argv;

			let answers = await inquirer.prompt([
				{
					type: "password",
					message: "Enter your password:",
					name: "password",
				},
			]);

			console.log("\nPassword length:", answers.password.length);

			const auth = getAuth(app);

			let res;

			try {
				res = await signInWithEmailAndPassword(auth, email, answers.password);
			} catch (e) {
				console.log("\nError signing in: ", e, ", attempting to create user");
				res = await createUserWithEmailAndPassword(auth, email, answers.password);
			}

			let token = await res.user.getIdToken();

			fs.mkdirSync("./HumanMade", { recursive: true });
			//write token to file name token.txt using fs.promises
			await fs.promises.writeFile("./HumanMade/token.txt", token);
			await fs.promises.writeFile("./HumanMade/uid.txt", res.user.uid);
		},
	})
	.parse();
