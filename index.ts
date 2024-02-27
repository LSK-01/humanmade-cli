import { FirebaseApp, initializeApp } from "firebase/app";
import { Timestamp, getFirestore } from "firebase/firestore";
import yargs from "yargs";
import fs from "fs";
import * as path from "path";
import mime from "mime-types";
import { getStorage, ref } from "firebase/storage";
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

const projectId = "humanmade-b1f8c";
const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;

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
			creationID: {
				describe: "Creation to commit to",
				demandOption: true,
				default: false,
				type: "string",
			},
		},
		async handler(argv: any) {
			const { files, tags, description, usedAI } = argv;
			for (let index = 0; index < files.length; index++) {
				const filename = files[index];
				const ext = path.extname(filename);
				const mimeType = mime.lookup(ext);
				const data = await fs.promises.readFile(filename, { encoding: "utf-8" });

				/*  const fileName = encodeURIComponent(tags[index] + "+" + mimeType + "+" + String(Date.now()));
                const storageRef = ref(storage, `${creation.id!}/${fileName}`);
                const snapshot = await uploadBytes(storageRef, file);
                const downloadURL = await getDownloadURL(snapshot.ref); */
			}

			/* db.collection(collection)
				.add(docData)
				.then((docRef) => console.log(`Document written with ID: ${docRef.id}`))
				.catch((error) => console.error("Error adding document: ", error)); */
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
				console.log("Make sure to login first with the 'login' command");
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

			const res = await fetch(url, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${idToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(creationsQuery),
			});

			const data = await res.json();
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

			console.log("Password length:", answers.password.length);

			const auth = getAuth(app);

			let res;

			try {
				res = await signInWithEmailAndPassword(auth, email, answers.password);
			} catch (e) {
				console.log("error signing in: ", e);
				res = await createUserWithEmailAndPassword(auth, email, answers.password);
			}

			let token = await res.user.getIdToken();
			//write token to file name token.txt using fs.promises
			await fs.promises.writeFile("./HumanMade/token.txt", token);
			await fs.promises.writeFile("./HumanMade/uid.txt", res.user.uid);
		},
	})
	.parse();
