function checkname(name: string) : Boolean
{
    //api call to check if name already in DB
}

function generateShadowName()
{
    const names = ["anon", "shadow", "secret"];
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ01234567890";


    let fullSub = names[Math.floor(Math.random() * (names.length))];

    let fullArgs = chars[Math.floor(Math.random() * (chars.length))]
    + chars[Math.floor(Math.random() * (chars.length))]
    + chars[Math.floor(Math.random() * (chars.length))]
    + chars[Math.floor(Math.random() * (chars.length))]
    + chars[Math.floor(Math.random() * (chars.length))];

    let fullName = fullSub + "_" + fullArgs;

    for (let i = 0; i == 0 || !checkname(fullName); i++)
    {
    fullSub = names[Math.floor(Math.random() * (names.length))];

    fullArgs = chars[Math.floor(Math.random() * (chars.length))]
    + chars[Math.floor(Math.random() * (chars.length))]
    + chars[Math.floor(Math.random() * (chars.length))]
    + chars[Math.floor(Math.random() * (chars.length))]
    + chars[Math.floor(Math.random() * (chars.length))];

    fullName = fullSub + "_" + fullArgs;
    }

    return fullName;
}