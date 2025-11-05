// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title AchievementsSBT
 * @notice Soulbound NFTs for FlagWars achievements.
 * - Non-transferable (SBT)
 * - Mint fee: 0.20 USDC
 * - EIP-712 signed authorization required
 * - One mint per (user, category, level)
 */
contract AchievementsSBT is ERC721, EIP712, Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ════════════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ════════════════════════════════════════════════════════════════════════════════

    uint256 public constant PRICE_USDC6 = 200_000; // 0.20 USDC (6 decimals)

    bytes32 public constant MINT_AUTH_TYPEHASH = keccak256(
        "MintAuth(address user,uint256 category,uint256 level,uint256 priceUSDC6,uint256 nonce,uint256 deadline)"
    );

    // ════════════════════════════════════════════════════════════════════════════════
    // STATE
    // ════════════════════════════════════════════════════════════════════════════════

    address public signer;      // Backend signer for mint authorization
    address public payToken;    // USDC address
    address public revenue;     // Revenue wallet

    string private _baseTokenURI;
    uint256 private _nextTokenId = 1;

    // category => level => is valid
    mapping(uint256 => mapping(uint256 => bool)) public validLevels;

    // user => category => level => has minted
    mapping(address => mapping(uint256 => mapping(uint256 => bool))) public minted;

    // user => nonce => has been used (replay protection)
    mapping(address => mapping(uint256 => bool)) public usedNonce;

    // tokenId => metadata
    struct TokenMetadata {
        address owner;
        uint256 category;
        uint256 level;
        uint256 timestamp;
    }
    mapping(uint256 => TokenMetadata) public tokenMetadata;

    // ════════════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ════════════════════════════════════════════════════════════════════════════════

    event AchievementMinted(
        address indexed user,
        uint256 indexed category,
        uint256 indexed level,
        uint256 tokenId,
        uint256 timestamp
    );

    event SignerUpdated(address indexed oldSigner, address indexed newSigner);
    event PayTokenUpdated(address indexed oldToken, address indexed newToken);
    event RevenueUpdated(address indexed oldRevenue, address indexed newRevenue);
    event ValidLevelSet(uint256 indexed category, uint256 indexed level, bool valid);
    event BaseURIUpdated(string newBaseURI);

    // ════════════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ════════════════════════════════════════════════════════════════════════════════

    error SBT_NON_TRANSFERABLE();
    error INVALID_SIGNER();
    error INVALID_LEVEL();
    error ALREADY_MINTED();
    error INVALID_PRICE();
    error NONCE_USED();
    error DEADLINE_EXPIRED();
    error INVALID_SIGNATURE();
    error UNAUTHORIZED_USER();

    // ════════════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ════════════════════════════════════════════════════════════════════════════════

    constructor(
        address _signer,
        address _payToken,
        address _revenue,
        string memory baseURI_
    ) 
        ERC721("FlagWars Achievements", "FWACHV") 
        EIP712("FlagWarsAchievements", "1") 
    {
        require(_signer != address(0), "ZERO_SIGNER");
        require(_payToken != address(0), "ZERO_PAY_TOKEN");
        require(_revenue != address(0), "ZERO_REVENUE");

        signer = _signer;
        payToken = _payToken;
        revenue = _revenue;
        _baseTokenURI = baseURI_;
    }

    // ════════════════════════════════════════════════════════════════════════════════
    // SOULBOUND OVERRIDES (Non-Transferable)
    // ════════════════════════════════════════════════════════════════════════════════

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal virtual override {
        // Allow mint (from == 0) and burn (to == 0), but prevent transfers
        if (from != address(0) && to != address(0)) revert SBT_NON_TRANSFERABLE();
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    function approve(address, uint256) public pure override {
        revert SBT_NON_TRANSFERABLE();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert SBT_NON_TRANSFERABLE();
    }

    function transferFrom(address, address, uint256) public pure override {
        revert SBT_NON_TRANSFERABLE();
    }

    function safeTransferFrom(address, address, uint256) public pure override {
        revert SBT_NON_TRANSFERABLE();
    }

    function safeTransferFrom(address, address, uint256, bytes memory) public pure override {
        revert SBT_NON_TRANSFERABLE();
    }

    // ════════════════════════════════════════════════════════════════════════════════
    // MINT AUTHORIZATION STRUCT
    // ════════════════════════════════════════════════════════════════════════════════

    struct MintAuth {
        address user;
        uint256 category;
        uint256 level;
        uint256 priceUSDC6;
        uint256 nonce;
        uint256 deadline;
    }

    // ════════════════════════════════════════════════════════════════════════════════
    // MINT FUNCTION
    // ════════════════════════════════════════════════════════════════════════════════

    function mint(
        MintAuth calldata auth,
        bytes calldata signature
    ) external nonReentrant whenNotPaused {
        // 1. Validate user
        if (auth.user != msg.sender) revert UNAUTHORIZED_USER();

        // 2. Validate level is whitelisted
        if (!validLevels[auth.category][auth.level]) revert INVALID_LEVEL();

        // 3. Check not already minted
        if (minted[msg.sender][auth.category][auth.level]) revert ALREADY_MINTED();

        // 4. Validate price
        if (auth.priceUSDC6 != PRICE_USDC6) revert INVALID_PRICE();

        // 5. Check deadline
        if (block.timestamp > auth.deadline) revert DEADLINE_EXPIRED();

        // 6. Check nonce not used
        if (usedNonce[msg.sender][auth.nonce]) revert NONCE_USED();

        // 7. Verify signature
        bytes32 structHash = keccak256(abi.encode(
            MINT_AUTH_TYPEHASH,
            auth.user,
            auth.category,
            auth.level,
            auth.priceUSDC6,
            auth.nonce,
            auth.deadline
        ));
        bytes32 digest = _hashTypedDataV4(structHash);
        address recovered = ECDSA.recover(digest, signature);
        if (recovered != signer) revert INVALID_SIGNATURE();

        // 8. Mark nonce as used
        usedNonce[msg.sender][auth.nonce] = true;

        // 9. Collect fee (USDC)
        IERC20(payToken).safeTransferFrom(msg.sender, revenue, PRICE_USDC6);

        // 10. Mint token
        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);

        // 11. Mark as minted
        minted[msg.sender][auth.category][auth.level] = true;

        // 12. Store metadata
        tokenMetadata[tokenId] = TokenMetadata({
            owner: msg.sender,
            category: auth.category,
            level: auth.level,
            timestamp: block.timestamp
        });

        // 13. Emit event
        emit AchievementMinted(msg.sender, auth.category, auth.level, tokenId, block.timestamp);
    }

    // ════════════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ════════════════════════════════════════════════════════════════════════════════

    function mintedOf(address user, uint256 category, uint256 level) external view returns (bool) {
        return minted[user][category][level];
    }

    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        require(ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
        TokenMetadata memory meta = tokenMetadata[tokenId];
        return string(abi.encodePacked(
            _baseTokenURI,
            "/",
            _toString(meta.category),
            "/",
            _toString(meta.level),
            ".json"
        ));
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return _baseTokenURI;
    }

    // ════════════════════════════════════════════════════════════════════════════════
    // GOVERNANCE
    // ════════════════════════════════════════════════════════════════════════════════

    function setSigner(address _signer) external onlyOwner {
        if (_signer == address(0)) revert INVALID_SIGNER();
        address old = signer;
        signer = _signer;
        emit SignerUpdated(old, _signer);
    }

    function setPayToken(address _payToken) external onlyOwner {
        require(_payToken != address(0), "ZERO_PAY_TOKEN");
        address old = payToken;
        payToken = _payToken;
        emit PayTokenUpdated(old, _payToken);
    }

    function setRevenue(address _revenue) external onlyOwner {
        require(_revenue != address(0), "ZERO_REVENUE");
        address old = revenue;
        revenue = _revenue;
        emit RevenueUpdated(old, _revenue);
    }

    function setBaseURI(string calldata uri) external onlyOwner {
        _baseTokenURI = uri;
        emit BaseURIUpdated(uri);
    }

    function setValidLevel(uint256 category, uint256 level, bool valid) external onlyOwner {
        validLevels[category][level] = valid;
        emit ValidLevelSet(category, level, valid);
    }

    function setValidLevelsBatch(
        uint256 category,
        uint256[] calldata levels,
        bool valid
    ) external onlyOwner {
        for (uint256 i = 0; i < levels.length; i++) {
            validLevels[category][levels[i]] = valid;
            emit ValidLevelSet(category, levels[i], valid);
        }
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ════════════════════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ════════════════════════════════════════════════════════════════════════════════

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}

