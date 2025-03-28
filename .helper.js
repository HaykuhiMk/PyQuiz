(async () => {
    const password = "haykuhiadminpython";
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("Hashed Password:", hashedPassword);
})();